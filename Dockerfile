# CHCC — نظام إدارة الالتزام
FROM node:22-slim

WORKDIR /app

# الاعتماديات أولاً للاستفادة من التخزين المؤقت لطبقات الصورة
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
# مجلد البيانات — اربطه بقرص دائم (volume) حتى لا تُفقد البيانات عند إعادة النشر
ENV CHCC_DATA_DIR=/data
VOLUME /data

EXPOSE 3000
CMD ["node", "server.js"]
