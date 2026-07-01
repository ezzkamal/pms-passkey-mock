import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

const envFiles = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../ims-front/.env.local"),
];

for (const envFile of envFiles) {
  if (existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
}

if (!process.env.BETTER_AUTH_SECRET && process.env.AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET = process.env.AUTH_SECRET;
}
