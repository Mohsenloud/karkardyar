FROM node:22-alpine

WORKDIR /app

# نصب پکیج‌ها
COPY package*.json ./
RUN npm install

# کپی سورس کد و بیلد فرانت‌اند (بدون فایل دیتابیس)
COPY . .
RUN rm -rf /app/data/*.sqlite* && npm run build && mkdir -p /app/data /app/legacy_data

# پوشه نگهداری دائمی دیتابیس SQLite (متصل به ولوم بیرونی سرور)
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Tehran
ENV DATA_DIR=/app/data
ENV LEGACY_DATA_DIR=/app/legacy_data

EXPOSE 3000

CMD ["npm", "start"]

