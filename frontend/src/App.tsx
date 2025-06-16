import { sdk } from "@farcaster/frame-sdk";
import { useEffect } from "react";
import ChatWindow from "./component/ChatWindow";

function App() {
  useEffect(() => {
    sdk.actions.ready();
  }, []);

  return (
    <div className="flex justify-center items-center h-screen bg-gray-200">
      <ChatWindow />
    </div>
  );
}

export default App;
