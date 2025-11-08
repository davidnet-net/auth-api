import { connect, AmqpConnection } from "https://deno.land/x/amqp@v0.24.0/mod.ts";

const RABBITMQ_USER = Deno.env.get("DA_RABBITMQ_USER") ?? "user";
const RABBITMQ_PASS = Deno.env.get("DA_RABBITMQ_PASS") ?? "pass";
const RABBITMQ_HOST = Deno.env.get("DA_RABBITMQ_HOST") ?? "rabbitmq";
const RABBITMQ_PORT = Number(Deno.env.get("DA_RABBITMQ_PORT") ?? "5672");

let connection: AmqpConnection | null = null;
let isRabbitMQConnectionHealthy = false;

export function getIsRabbitMQConnectionHealthy() {
    return isRabbitMQConnectionHealthy;
}

async function connectToRabbitMQ(): Promise<AmqpConnection | null> {
    try {
        console.log("[RabbitMQ] Connecting...");
        const conn = await connect({
            hostname: RABBITMQ_HOST,
            port: RABBITMQ_PORT,
            username: RABBITMQ_USER,
            password: RABBITMQ_PASS,
        });
        isRabbitMQConnectionHealthy = true;
        console.log("[RabbitMQ] Connected");

        // Listen for connection close events
        conn.closed().then(() => {
            console.error("[RabbitMQ] Connection closed");
            isRabbitMQConnectionHealthy = false;
            connection = null;
            scheduleReconnect();
        });

        return conn;
        // deno-lint-ignore no-explicit-any
    } catch (err: any) {
        console.error("[RabbitMQ] Connection failed:", err.message);
        isRabbitMQConnectionHealthy = false;
        scheduleReconnect();
        return null;
    }
}

let reconnectTimeout: number | null = null;

function scheduleReconnect() {
    if (reconnectTimeout) return; // Prevent multiple timers
    console.log("[RabbitMQ] Reconnecting in 60s...");
    reconnectTimeout = setTimeout(async () => {
        reconnectTimeout = null;
        connection = await connectToRabbitMQ();
    }, 60_000);
}

export async function getRabbitMQConnection(): Promise<AmqpConnection> {
    if (connection) return connection;

    connection = await connectToRabbitMQ();
    if (!connection) {
        throw new Error("RabbitMQ connection unavailable");
    }

    return connection;
}
