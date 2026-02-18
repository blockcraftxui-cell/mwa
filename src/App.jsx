import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { PublicKey } from "@solana/web3.js";
const APP_IDENTITY = {
  name: "My Solana App",
  uri: window.location.origin,
  icon: "/favicon.ico",
};
export default function App() {
  const onClickHandler = async () => {
    await transact(async (wallet) => {
      const result = await wallet.authorize({
        identity: APP_IDENTITY,
        auth_token: undefined,
      });

      console.log("signing....", result);
      const [p] = await wallet.signMessages({
        addresses: [result.accounts[0].address],
        payloads: [
          new TextEncoder().encode(
            `Sign this message to authenticate.\nTimestamp: ${Date.now()}`,
          ),
        ],
      });
      console.log(p);
    });
  };
  return (
    <div>
      <button onClick={onClickHandler}>Click Me</button>
    </div>
  );
}
