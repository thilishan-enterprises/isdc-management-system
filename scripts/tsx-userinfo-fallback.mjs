import os from "node:os";

try {
  os.userInfo();
} catch {
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || "windows-user",
    homedir: process.env.USERPROFILE || "",
    shell: null,
  });
}
