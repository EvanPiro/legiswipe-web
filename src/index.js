import "./main.css";
import { Elm } from "./Main.elm";
import * as serviceWorker from "./serviceWorker";
import * as dotenv from "dotenv";

dotenv.config();

const key = "data";
const apiKey = process.env.ELM_APP_API_KEY;

const rawData = localStorage.getItem(key);
const flags = { maybeModel: rawData ? JSON.parse(rawData) : null, apiKey };

const app = Elm.Main.init({
  node: document.getElementById("root"),
  flags,
});

app.ports.cache.subscribe(function (model) {
  localStorage.setItem(key, JSON.stringify(model));
});

serviceWorker.unregister();
