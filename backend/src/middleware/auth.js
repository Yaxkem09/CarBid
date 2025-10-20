import jwt from 'jsonwebtoken';

export function auth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ message: 'No autorizado' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido' });
  }
}