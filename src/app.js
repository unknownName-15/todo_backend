const express  = require('express');
const cors     = require('cors');
const session  = require('express-session');
const passport = require('./config/passport');
require('dotenv').config();

const authRouter     = require('./routes/auth');
const todosRouter    = require('./routes/todos');
const calendarRouter = require('./routes/calendar');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth',     authRouter);
app.use('/todos',    todosRouter);
app.use('/calendar', calendarRouter);

// 공통 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ message: err.message || '서버 오류' });
});

module.exports = app;