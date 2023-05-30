import "./main.css";
import { Elm } from "./Main.elm";
import * as serviceWorker from "./serviceWorker";
import * as dotenv from "dotenv";

dotenv.config();

const app = Elm.Main.init({
  node: document.getElementById("root"),
  flags: {
    apiKey: process.env.ELM_APP_API_KEY,
    googleClientId: process.env.ELM_APP_GOOGLE_CLIENT_ID,
  },
});

app.ports.signIn.subscribe(function (googleClientId) {
  console.log("log on clicked");
  google.accounts.id.initialize({
    client_id: googleClientId,
    callback: function (obj) {
      app.ports.signInSuccess.send(obj.credential);
    },
  });
  google.accounts.id.prompt();
});

serviceWorker.unregister();
