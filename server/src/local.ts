import "dotenv/config";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 8000;
createApp().listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
  if (process.env.AUTH_DISABLED === "true") {
    console.log("AUTH_DISABLED=true: requests are treated as a local admin user");
  }
});
