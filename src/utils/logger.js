import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

const fmt = printf(({ level, message, timestamp: ts, ...meta }) => {
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]${extra} ${message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }), fmt),
  transports: [
    new winston.transports.Console({ format: combine(colorize(), fmt) }),
    new winston.transports.File({ filename: 'bot.log', maxsize: 10_000_000, maxFiles: 5 }),
  ],
});
