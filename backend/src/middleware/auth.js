import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const authenticateAdmin = (req, res, next) => {
  try {
    const token = req.cookies.admin_token;
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Forbidden: Invalid role' });
    }
    
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token' });
  }
};
