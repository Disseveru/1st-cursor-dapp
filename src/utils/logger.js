import winston from 'winston';
import settings from '../config/settings.js';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]${extra} ${message}`;
});

const logger = winston.createLogger({
  level: settings.logging.level,
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), logFormat),
  transports: [
    new winston.transports.Console({ format: combine(colorize(), timestamp({ format: 'HH:mm:ss.SSS' }), logFormat) }),
    new winston.transports.File({ filename: 'bot.log', maxsize: 10_000_000, maxFiles: 3 }),
  ],
});

export default logger;
