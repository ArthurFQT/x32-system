const { spawn } = require("child_process");

const [runtimeEnv, command, ...args] = process.argv.slice(2);

if (!runtimeEnv || !["dev", "prod"].includes(runtimeEnv) || !command) {
  console.error("Uso: node scripts/run-env.cjs <dev|prod> <comando> [...args]");
  process.exit(1);
}

function quoteArg(value) {
  if (!/[\s"'&|<>^()]/.test(value)) {
    return value;
  }

  if (process.platform === "win32") {
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

const commandLine = [command, ...args].map(quoteArg).join(" ");

const child = spawn(commandLine, {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    X32_ENV: runtimeEnv,
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
