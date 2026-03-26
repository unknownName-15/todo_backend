const express = require('express');
const { google } = require('googleapis');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// Google OAuth 클라이언트 생성
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

  // 토큰 자동 갱신 시 DB 업데이트
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

// GET /calendar?start=2026-03-01&end=2026-03-31
router.get('/', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const auth = await getOAuthClient(req.userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: 'Asia/Seoul',
      showDeleted: false,
      maxResults: 100,
    });

    // 종일 일정 + 시간 일정 모두 포함
    const items = response.data.items.filter(
      (e) => e.start?.date || e.start?.dateTime
    );

    console.log('조회된 일정:', items.map(e => ({
      title: e.summary,
      start: e.start,
    })));

    res.json(items);
  } catch (e) {
    next(e);
  }
});

// POST /calendar — 일정 추가
router.post('/', async (req, res, next) => {
  try {
    const { title, start, end, description } = req.body;
    const auth = await getOAuthClient(req.userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        start: { dateTime: new Date(start).toISOString(), timeZone: 'Asia/Seoul' },
        end:   { dateTime: new Date(end).toISOString(),   timeZone: 'Asia/Seoul' },
      },
    });

    res.status(201).json(response.data);
  } catch (e) {
    next(e);
  }
});

// PUT /calendar/:eventId — 일정 수정
router.put('/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { title, start, end, description } = req.body;
    const auth = await getOAuthClient(req.userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: {
        summary: title,
        description,
        start: { dateTime: new Date(start).toISOString(), timeZone: 'Asia/Seoul' },
        end:   { dateTime: new Date(end).toISOString(),   timeZone: 'Asia/Seoul' },
      },
    });

    res.json(response.data);
  } catch (e) {
    next(e);
  }
});

// DELETE /calendar/:eventId — 일정 삭제
router.delete('/:eventId', async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const auth = await getOAuthClient(req.userId);
    const calendar = google.calendar({ version: 'v3', auth });

    // 구글 캘린더에서 삭제
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });

    // 연동된 todo 도 함께 삭제
    await pool.query(
      'DELETE FROM todos WHERE calendar_event_id=$1 AND user_id=$2',
      [eventId, req.userId]
    );

    res.json({ message: '삭제 완료' });
  } catch (e) {
    next(e);
  }
});

// GET /calendar/holidays — 한국 공휴일
router.get('/holidays', async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const auth = await getOAuthClient(req.userId);
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
      calendarId: 'ko.south_korea#holiday@group.v.calendar.google.com',
      timeMin: new Date(start).toISOString(),
      timeMax: new Date(end).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    res.json(response.data.items);
  } catch (e) {
    next(e);
  }
});

module.exports = router;