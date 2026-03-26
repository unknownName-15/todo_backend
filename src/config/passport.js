const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/auth/google/callback',
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails[0].value;

        const exists = await pool.query(
          'SELECT * FROM users WHERE email=$1',
          [email]
        );

        if (exists.rows.length > 0) {
          // 토큰 업데이트
          await pool.query(
            'UPDATE users SET google_access_token=$1, google_refresh_token=$2 WHERE email=$3',
            [accessToken, refreshToken || exists.rows[0].google_refresh_token, email]
          );
          return done(null, exists.rows[0]);
        }

        const result = await pool.query(
          'INSERT INTO users (email, google_access_token, google_refresh_token) VALUES ($1, $2, $3) RETURNING *',
          [email, accessToken, refreshToken]
        );

        return done(null, result.rows[0]);
      } catch (e) {
        return done(e, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
    done(null, result.rows[0]);
  } catch (e) {
    done(e, null);
  }
});

module.exports = passport;