//? Libaries
import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { existsSync } from "https://deno.land/std@0.185.0/fs/mod.ts";

//? Modules
import { connectdb } from "./sql.ts";

//? Objects
const enviroment = config();

//? Tests
function RunEnvTests() {
    connectdb(enviroment);
}

// test()

if (existsSync(".env")) {
    RunEnvTests();
} else {
    console.warn("No .env file found!");
    console.warn("Skipping enviroment based tests!");
}
