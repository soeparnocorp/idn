import {
type Connection,
Server,
type WSMessage,
routePartykitRequest,
} from "partyserver";

import type { ChatMessage, Message } from "../shared";

export class Chat extends Server<Env> {
static options = { hibernate: true };

messages = [] as ChatMessage[];

broadcastMessage(message: Message, exclude?: string[]) {
this.broadcast(JSON.stringify(message), exclude);
}

onStart() {
this.ctx.storage.sql.exec(
"CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, user TEXT, role TEXT, content TEXT)",
);

this.messages = this.ctx.storage.sql
  .exec(`SELECT * FROM messages`)
  .toArray() as ChatMessage[];

}

onConnect(connection: Connection) {
connection.send(
JSON.stringify({
type: "all",
messages: this.messages,
} satisfies Message),
);
}

saveMessage(message: ChatMessage) {
const existingMessage = this.messages.find((m) => m.id === message.id);
if (existingMessage) {
this.messages = this.messages.map((m) =>
m.id === message.id ? message : m,
);
} else {
this.messages.push(message);
}

this.ctx.storage.sql.exec(
  `INSERT INTO messages (id, user, role, content) VALUES ('${
    message.id
  }', '${message.user}', '${message.role}', ${JSON.stringify(
    message.content,
  )}) ON CONFLICT (id) DO UPDATE SET content = ${JSON.stringify(
    message.content,
  )}`,
);

}

onMessage(connection: Connection, message: WSMessage) {
// broadcast raw message
this.broadcast(message);

const parsed = JSON.parse(message as string) as Message;
if (parsed.type === "add" || parsed.type === "update") {
  this.saveMessage(parsed);
}

}
}

// Middleware for token verification
async function verifyToken(request: Request, env: Env): Promise<boolean> {
const token = request.headers.get("Authorization")?.replace("Bearer ", "");
if (!token) return false;

try {
const verifyUrl = new URL("https://openauth-idn.soeparnocorp.workers.dev/verify-token");
verifyUrl.searchParams.set("token", token);

const res = await fetch(verifyUrl.toString());
if (!res.ok) return false;

const data = await res.json();
return data.valid === true;

} catch (err) {
console.error("Token verification failed:", err);
return false;
}
}

export default {
async fetch(request: Request, env: Env) {
// Verify token before allowing access
const isValid = await verifyToken(request, env);
if (!isValid) {
return new Response("Unauthorized", { status: 401 });
}

// Proceed with PartyServer or static assets
return (
  (await routePartykitRequest(request, { ...env })) || env.ASSETS.fetch(request)
);

},
} satisfies ExportedHandler<Env>;
