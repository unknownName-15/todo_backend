const express  = require('express');
const pool     = require('../config/db');
const authMiddleware = require('../middleware/auth');
const { google } = require('googleapis');

const router = express.Router();
router.use(authMiddleware);

const getOAuthClient = async (userId) => {
  const result = await pool.query(
    'SELECT google_access_token, google_refresh_token FROM users WHERE id=$1',
    [userId]
  );
  const { google_access_token, google_refresh_token } = result.rows[0];

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.SERVER_URL}/auth/google/callback`
  );

  oauth2Client.setCredentials({
    access_token: google_access_token,
    refresh_token: google_refresh_token,
  });

  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await pool.query(
        'UPDATE users SET google_access_token=$1 WHERE id=$2',
        [tokens.access_token, userId]
      );
    }
  });

  return oauth2Client;
};

// GET /todos
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM todos WHERE user_id=$1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (e) {
    next(e);
  }
});

// POST /todos/from-calendar
router.post('/from-calendar', async (req, res, next) => {
  try {
    const { content, due_date, calendar_event_id } = req.body;

    const exists = await pool.query(
      'SELECT * FROM todos WHERE calendar_event_id=$1 AND user_id=$2',
      [calendar_event_id, req.userId]
    );

    let todo;
    if (exists.rows.length > 0) {
      todo = exists.rows[0];
    } else {
      const result = await pool.query(
        'INSERT INTO todos (user_id, content, due_date, calendar_event_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [req.userId, content, due_date || null, calendar_event_id]
      );
      todo = result.rows[0];
    }

    const updated = await pool.query(
      'UPDATE todos SET is_done = NOT is_done WHERE id=$1 AND user_id=$2 RETURNING *',
      [todo.id, req.userId]
    );

    try {
      const auth     = await getOAuthClient(req.userId);
      const calendar = google.calendar({ version: 'v3', auth });
      await calendar.events.patch({
        calendarId: 'primary',
        eventId: calendar_event_id,
        requestBody: {
          summary: updated.rows[0].is_done ? `✅ ${content}` : content,
        },
      });
    } catch (e) {
      console.error('캘린더 완료 표시 실패:', e.message);
    }

    res.json(updated.rows[0]);
  } catch (e) {
    next(e);
  }
});

// POST /todos
router.post('/', async (req, res, next) => {
  try {
    const { content, priority = 'none', due_date = null, start_time = null, end_time = null } = req.body;
    if (!content) return res.status(400).json({ message: '내용을 입력해 주세요.' });

    let calendar_event_id = null;

    if (due_date) {
      try {
        const auth     = await getOAuthClient(req.userId);
        const calendar = google.calendar({ version: 'v3', auth });

        const startDateTime = start_time
          ? { dateTime: `${due_date}T${start_time}:00`, timeZone: 'Asia/Seoul' }
          : { date: due_date };
        const endDateTime = end_time
          ? { dateTime: `${due_date}T${end_time}:00`, timeZone: 'Asia/Seoul' }
          : start_time
          ? { dateTime: `${due_date}T${start_time}:00`, timeZone: 'Asia/Seoul' }
          : { date: due_date };

        const event = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: content,
            start: startDateTime,
            end: endDateTime,
            description: `FOCUS 할일 | 중요도: ${priority}`,
          },
        });
        calendar_event_id = event.data.id;
      } catch (e) {
        console.error('캘린더 등록 실패:', e.message);
      }
    }

    const result = await pool.query(
      'INSERT INTO todos (user_id, content, priority, due_date, start_time, end_time, calendar_event_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.userId, content, priority, due_date, start_time, end_time, calendar_event_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT /todos/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE todos SET is_done = NOT is_done WHERE id=$1 AND user_id=$2 RETURNING *`,
      [id, req.userId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: '할일을 찾을 수 없습니다.' });

    const todo = result.rows[0];

    if (todo.calendar_event_id) {
      try {
        const auth     = await getOAuthClient(req.userId);
        const calendar = google.calendar({ version: 'v3', auth });
        await calendar.events.patch({
          calendarId: 'primary',
          eventId: todo.calendar_event_id,
          requestBody: {
            summary: todo.is_done ? `✅ ${todo.content}` : todo.content,
          },
        });
      } catch (e) {
        console.error('캘린더 업데이트 실패:', e.message);
      }
    }

    res.json(todo);
  } catch (e) {
    next(e);
  }
});

// PATCH /todos/:id/priority
router.patch('/:id/priority', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;
    const result = await pool.query(
      `UPDATE todos SET priority=$1 WHERE id=$2 AND user_id=$3 RETURNING *`,
      [priority, id, req.userId]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: '할일을 찾을 수 없습니다.' });
    res.json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});

// PATCH /todos/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, due_date, start_time = null, end_time = null } = req.body;
    if (!content) return res.status(400).json({ message: '내용을 입력해 주세요.' });

    const existing = await pool.query(
      'SELECT * FROM todos WHERE id=$1 AND user_id=$2',
      [id, req.userId]
    );
    if (existing.rows.length === 0)
      return res.status(404).json({ message: '할일을 찾을 수 없습니다.' });

    const todo = existing.rows[0];
    let calendar_event_id = todo.calendar_event_id;

    try {
      const auth     = await getOAuthClient(req.userId);
      const calendar = google.calendar({ version: 'v3', auth });

      const startDateTime = start_time && due_date
        ? { dateTime: `${due_date}T${start_time}:00`, timeZone: 'Asia/Seoul' }
        : due_date ? { date: due_date } : undefined;
      const endDateTime = end_time && due_date
        ? { dateTime: `${due_date}T${end_time}:00`, timeZone: 'Asia/Seoul' }
        : startDateTime;

      if (calendar_event_id) {
        await calendar.events.patch({
          calendarId: 'primary',
          eventId: calendar_event_id,
          requestBody: {
            summary: content,
            ...(startDateTime && { start: startDateTime, end: endDateTime }),
          },
        });
      } else if (due_date) {
        const event = await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: content,
            start: startDateTime,
            end: endDateTime || startDateTime,
          },
        });
        calendar_event_id = event.data.id;
      }
    } catch (e) {
      console.error('캘린더 수정 실패:', e.message);
    }

    const result = await pool.query(
      `UPDATE todos SET content=$1, due_date=$2, start_time=$3, end_time=$4, calendar_event_id=$5 WHERE id=$6 AND user_id=$7 RETURNING *`,
      [content, due_date ?? null, start_time, end_time, calendar_event_id, id, req.userId]
    );
    res.json(result.rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /todos/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query(
      'SELECT * FROM todos WHERE id=$1 AND user_id=$2',
      [id, req.userId]
    );
    if (existing.rows.length === 0)
      return res.status(404).json({ message: '할일을 찾을 수 없습니다.' });

    const todo = existing.rows[0];

    if (todo.calendar_event_id) {
      try {
        const auth     = await getOAuthClient(req.userId);
        const calendar = google.calendar({ version: 'v3', auth });
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: todo.calendar_event_id,
        });
      } catch (e) {
        console.error('캘린더 삭제 실패:', e.message);
      }
    }

    await pool.query('DELETE FROM todos WHERE id=$1 AND user_id=$2', [id, req.userId]);
    res.json({ message: '삭제 완료' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;