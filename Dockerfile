FROM node:22-alpine

WORKDIR /app

# نصب پکیج‌ها
COPY package*.json ./
RUN npm install

# کپی سورس کد و بیلد فرانت‌اند
COPY . .
RUN npm run build && mkdir -p /app/data

# پوشه نگهداری دائمی دیتابیس SQLite
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Tehran

EXPOSE 3000

CMD ["npm", "start"]
