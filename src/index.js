import "./main.css";
import { Elm } from "./Main.elm";
import * as serviceWorker from "./serviceWorker";
import * as dotenv from "dotenv";
import * as Migrations from "./migrations";

const key = "data";

dotenv.config();

const apiKey = process.env.ELM_APP_API_KEY;

const rawData = localStorage.getItem(key);
const maybeModel = rawData ? Migrations.upgrade(JSON.parse(rawData)) : null;

const flags = { maybeModel, apiKey };

Elm.Main.init({
  node: document.getElementById("root"),
  flags,
});

serviceWorker.unregister();
