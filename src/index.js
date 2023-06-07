import "./main.css";
import { Elm } from "./Main.elm";
import * as serviceWorker from "./serviceWorker";
import * as dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const app = Elm.Main.init({
  node: document.getElementById("root"),
  flags: {
    apiKey: process.env.ELM_APP_API_KEY,
    googleClientId: process.env.ELM_APP_GOOGLE_CLIENT_ID,
  },
});

{
  // The "any" network will allow spontaneous network changes
  const provider = new ethers.providers.Web3Provider(window.ethereum, "any");
  provider.on("network", (newNetwork, oldNetwork) => {
    // When a Provider makes its initial connection, it emits a "network"
    // event with a null oldNetwork along with the newNetwork. So, if the
    // oldNetwork exists, it represents a changing network
    if (oldNetwork) {
      window.location.reload();
    }
  });
}

app.ports.connectWallet.subscribe(async function () {
  try {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    const { chainId } = await provider.getNetwork();
    if (chainId === 11155111) {
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      console.log("wallet detected");
      app.ports.walletFound.send(address);
    } else {
      app.ports.walletError.send("Please switch network to Sepolia");
    }
  } catch (e) {
    console.log(e);
    console.log("wallet not detected");
    app.ports.walletError.send(
      "Wallet not detected. Please set up a browser wallet to redeem tokens."
    );
  }
});

app.ports.getAuthToken.subscribe(function (googleClientId) {
  console.log("log on clicked");
  console.log(googleClientId);
  google.accounts.id.initialize({
    client_id: googleClientId,
    callback: function (obj) {
      console.log(obj);
      app.ports.authTokenSuccess.send(obj.credential);
    },
  });
  google.accounts.id.prompt();
});

serviceWorker.unregister();
