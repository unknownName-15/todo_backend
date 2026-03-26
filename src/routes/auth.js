const express  = require('express');
const jwt      = require('jsonwebtoken');
const passport = require('../config/passport');

const router = express.Router();

// Google 로그인 시작 — Calendar 권한 추가
router.get('/google',
  passport.authenticate('google', {
    scope: [
      'email',
      'profile',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ],
    accessType: 'offline',
    prompt: 'consent', // refresh_token 매번 받기
  })
);

// Google 콜백
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/', session: false }),
  (req, res) => {
    const token = jwt.sign(
      { userId: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const user = JSON.stringify({ id: req.user.id, email: req.user.email });

    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?token=${token}&user=${encodeURIComponent(user)}`
    );
  }
);

module.exports = router;