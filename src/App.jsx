import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
const APP_IDENTITY = {
  name: "My Solana App",
  uri: window.location.origin,
  icon: "/favicon.ico",
};
export default function App() {
  const onClickHandler = async () => {
    await transact(async () => {
      const result = await wallet.authorize({
        identity: APP_IDENTITY,
        auth_token: token ?? undefined,
      });

      console.log("signing....", result);
      const [p] = await wallet.signMessages({
        addresses: [
          new PublicKey(
            "59hFeDtkd9rppzDXi2as2ViX6W6weVPc2LLGXSnNB9Bi",
          ).toBase58(),
        ],
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
