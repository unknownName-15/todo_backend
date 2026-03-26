const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ message: '토큰이 없습니다.' });

  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ message: '토큰 형식이 올바르지 않습니다.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('decoded:', decoded); // 여기 추가
    req.userId = decoded.userId;
    next();
  } catch (e) {
    return res.status(401).json({ message: '유효하지 않은 토큰입니다.' });
  }
};