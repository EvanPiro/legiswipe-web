import "./main.css";
import { Elm } from "./Main.elm";
import * as serviceWorker from "./serviceWorker";
import * as dotenv from "dotenv";

dotenv.config();

const key = "data";
const apiKey = process.env.ELM_APP_API_KEY;

const rawData = localStorage.getItem(key);
const flags = { maybeModel: rawData ? JSON.parse(rawData) : null, apiKey };

console.log(process.env);

console.log("flags: ", flags);

const app = Elm.Main.init({
  node: document.getElementById("root"),
  flags,
});

app.ports.cache.subscribe(function (model) {
  localStorage.setItem(key, JSON.stringify(model));
});

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
