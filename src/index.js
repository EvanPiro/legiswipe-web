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

const app = Elm.Main.init({
  node: document.getElementById("root"),
  flags,
});

app.ports.cache.subscribe(function (model) {
  localStorage.setItem(key, JSON.stringify(model));
});

app.ports.clearCache.subscribe(function (model) {
  localStorage.clear();
});

serviceWorker.unregister();
