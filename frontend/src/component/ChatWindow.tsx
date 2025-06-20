// src/components/ChatWindow.tsx
import { useState, useEffect, useRef } from "react";
import axios from "axios";
import CommandButtons from "./CommandButtons";
import { sdk } from "@farcaster/frame-sdk";
import { useConnect, useAccount } from "wagmi";

interface Message {
  text: string;
  isUser?: boolean;
  buttons?: { label: string; callback: string }[][];
}

function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([
    { text: "Welcome to ForgeBot! Use buttons or type commands." },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userFid, setUserFid] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const { connect, connectors } = useConnect();
  const { isConnected: isAccountConnected } = useAccount();
  const lastCommand = useRef<{ fid: string | null; command: string; time: number }>({
    fid: null,
    command: "",
    time: 0,
  });
  const currentAction = useRef<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const context = await sdk.context;
        console.log("Farcaster context.user:", context.user);
        const fid = context.user.fid;
        const displayName = context.user.displayName || "User";
        const username = context.user.username || "player";
        setUserFid(fid);
        setUsername(username);
        setDisplayName(displayName);
        sessionStorage.setItem("fid", fid.toString());
        sessionStorage.setItem("username", username);
        sessionStorage.setItem("displayName", displayName);
      } catch {
        setUsername("player");
        setDisplayName("User");
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    const autoConnectInMiniApp = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp();
        if (inMiniApp && !isAccountConnected) {
          const farcasterConnector = connectors.find(
            (c) => c.id === "farcasterFrame"
          );
          if (farcasterConnector) {
            connect({ connector: farcasterConnector });
          }
        }
      } catch (error) {
        console.error("Error during auto-connect:", error);
      }
    };
    autoConnectInMiniApp();
  }, [isAccountConnected, connect, connectors]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const fid = sessionStorage.getItem("fid");
    if (fid) {
      setUserFid(parseInt(fid));
    }
  }, []);

  const sendCommand = async (command: string, args?: string, isCallback: boolean = false) => {
    const fid = sessionStorage.getItem("fid");
    const username = sessionStorage.getItem("username");
    const displayName = sessionStorage.getItem("displayName");

    // Debounce: Ignore duplicate commands within 1 second
    if (
      lastCommand.current.fid === fid &&
      lastCommand.current.command === command &&
      Date.now() - lastCommand.current.time < 1000
    ) {
      console.log("Ignoring duplicate command:", command);
      return;
    }
    lastCommand.current = { fid, command, time: Date.now() };

    console.log("sendCommand: fid =", fid, "username =", username, "displayName =", displayName, "command =", command, "args =", args, "isCallback =", isCallback, "currentAction =", currentAction.current);

    if (!fid) {
      setMessages([
        ...messages,
        { text: "Please authenticate via Farcaster." },
      ]);
      return;
    }

    setMessages([...messages, { text: args || command, isUser: true }]);
    setIsLoading(true);

    try {
      const payload: any = {
        fid,
        username,
        displayName,
      };

      let endpoint = "/api/command";
      // Check if expecting input for specific actions
      const lastMessage = messages[messages.length - 1]?.text || "";
      if (
        isCallback ||
        lastMessage.includes("Please send the ERC-20 token address") ||
        lastMessage.includes("Please enter the amount of ETH") ||
        lastMessage.includes("Please send your private key")
      ) {
        endpoint = "/api/callback";
        payload.callback = isCallback ? command : null;
        payload.args = args || (isCallback ? undefined : command);
      } else {
        payload.command = command;
      }

      const apiUrl = process.env.NODE_ENV === "production"
        ? "https://forgeback-production.up.railway.app"
        : "http://localhost:3000"; // Adjust port if needed
      console.log("Sending request to:", `${apiUrl}${endpoint}`, "payload:", payload);
      const response = await axios.post(`${apiUrl}${endpoint}`, payload, {
        withCredentials: true,
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
      });
      console.log("Response headers:", response.headers, "Set-Cookie:", response.headers["set-cookie"]);
      setMessages((prev) => [
        ...prev,
        { text: response.data.response, buttons: response.data.buttons },
      ]);
      // Update currentAction based on response or context
      if (response.data.response.includes("Please send the ERC-20 token address")) {
        currentAction.current = "buy_custom_token";
      } else if (response.data.response.includes("Please enter the amount of ETH")) {
        currentAction.current = "buy_amount";
      } else if (response.data.response.includes("Please send your private key")) {
        currentAction.current = "import_wallet";
      } else {
        currentAction.current = null;
      }
    } catch (error) {
      console.error("Error processing command:", error);
      if (axios.isAxiosError(error)) {
        console.log("Axios error details:", {
          message: error.message,
          code: error.code,
          response: error.response
            ? {
                status: error.response.status,
                data: error.response.data,
                headers: error.response.headers,
              }
            : null,
        });
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessages((prev) => [
        ...prev,
        { text: `Error: ${errorMessage}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendCommand(input.trim());
      setInput("");
    }
  };

  const handleButtonClick = (callback: string) => {
    sendCommand(callback, undefined, true);
  };

  return (
    <div className="text-black flex flex-col h-[695px] w-[424px] bg-gray-100 p-4 font-sans text-sm">
      <div className="flex-1 overflow-y-auto mb-4 bg-white rounded-lg p-2 shadow">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-2 m-1 rounded ${msg.isUser ? "bg-blue-100 ml-8" : "bg-gray-200 mr-8"}`}
          >
            <pre className="whitespace-pre-wrap">{msg.text}</pre>
            {i === 0 && userFid && (
              <p className="text-xs text-gray-500 mt-1">Your Farcaster ID: {userFid}</p>
            )}
            {i === 0 && username && (
              <p className="text-xs text-gray-500">Logged in as: {username}</p>
            )}
            {i === 0 && displayName && (
              <p className="text-xs text-gray-500">Logged in as: {displayName}</p>
            )}
            {msg.buttons && (
              <div className="mt-2 flex flex-wrap gap-2">
                {msg.buttons.map((row, rowIdx) => (
                  <div key={rowIdx} className="flex gap-2">
                    {row.map((btn, btnIdx) => (
                      <button
                        key={btnIdx}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600"
                        onClick={() => handleButtonClick(btn.callback)}
                        disabled={isLoading}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <CommandButtons onCommand={sendCommand} />
      <form onSubmit={handleSubmit} className="flex mt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter command..."
          className="flex-1 p-2 rounded-l border border-gray-300"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="bg-blue-500 text-white p-2 rounded-r"
          disabled={isLoading}
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}

export default ChatWindow;