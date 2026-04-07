import PgBoss from "pg-boss";

let bossInstance: PgBoss | null = null;
let bossStart: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
    if (bossInstance) return bossInstance;
    if (bossStart) return bossStart;

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set");
    }

    const boss = new PgBoss({ connectionString, schema: "pgboss" });
    boss.on("error", (error) => {
        console.error("pg-boss error:", error);
    });

    bossStart = boss.start().then(() => {
        bossInstance = boss;
        bossStart = null;
        return boss;
    }).catch((error) => {
        bossStart = null;
        throw error;
    });

    return bossStart;
}
