import { useState, useEffect, useRef } from "react";
import axios from "axios";
import CommandButtons from "./CommandButtons";
import { sdk } from "@farcaster/frame-sdk";

interface Message {
  text: string;
  isUser?: boolean;
  buttons?: { label: string; callback: string }[][];
}

function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([
    { text: "Welcome to ForgeBot! Initializing..." },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [botState, setBotState] = useState<any>({
    currentAction: undefined,
    tempData: {},
    settings: { slippage: 1.0, gasPriority: 'medium' },
  });

  useEffect(() => {
    const initializeUser = async () => {
      try {
        const context = await sdk.context;
        if (!context.user) {
            setMessages(prev => [...prev, { text: "Could not find Farcaster user. Please run this in a Farcaster client like Warpcast."}]);
            return;
        }
        
        const dName = context.user.displayName || "Farcaster User";
        const uName = context.user.username || "player";
        
        setDisplayName(dName);

        sessionStorage.setItem("fid", context.user.fid.toString());
        sessionStorage.setItem("username", uName);
        sessionStorage.setItem("displayName", dName);

        sendCommand("/start", false);

      } catch (err) {
        console.error("Farcaster context error:", err);
        setDisplayName("Guest");
        setMessages(prev => [...prev, { text: "Error initializing Farcaster connection." }]);
      }
    };
    
    initializeUser();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendCommand = async (command: string, isCallback: boolean) => {
    const fid = sessionStorage.getItem("fid");
    const username = sessionStorage.getItem("username");
    const displayName = sessionStorage.getItem("displayName");

    if (!fid) {
      setMessages(prev => [...prev, { text: "Farcaster user ID not found. Please reload." }]);
      return;
    }
    if (isLoading) return;

    setMessages(prev => [...prev, { text: command, isUser: true }]);
    setIsLoading(true);

    try {
      const apiUrl = process.env.NODE_ENV === "production" 
        ? "https://forgeback-production.up.railway.app" 
        : "http://localhost:3000";
      
      const endpoint = isCallback ? `${apiUrl}/api/callback` : `${apiUrl}/api/action`;

      const payload = {
        fid,
        username,
        displayName,
        action: command,
        callback: command,
        ...botState
      };
      
      const response = await axios.post(endpoint, payload);
      const responseData = response.data;

      setMessages((prev) => [
        ...prev,
        { text: responseData.response, buttons: responseData.buttons },
      ]);

      if (responseData.newState) {
        setBotState(responseData.newState);
      } else {
        setBotState((prev: any) => ({ ...prev, currentAction: undefined, tempData: {} }));
      }

    } catch (error) {
    let errorMessage = "An unknown error occurred.";

    if (axios.isAxiosError(error)) {
        
        if (error.code === 'ERR_NETWORK' || error.message.includes("ERR_NAME_NOT_RESOLVED")) {
            errorMessage = "⚠️ Network Error. Please check your internet connection and try again.";
        } else {
            errorMessage = error.response?.data?.response || error.message;
        }

    } else {
        errorMessage = String(error);
    }
      setMessages((prev) => [...prev, { text: `Error: ${errorMessage}` }]);
      setBotState((prev: any) => ({ ...prev, currentAction: undefined, tempData: {} }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendCommand(input.trim(), false);
      setInput("");
    }
  };

  const handleButtonClick = (callback: string) => {
    sendCommand(callback, true);
  };

  return (
   
    <div className="flex flex-col h-screen w-screen max-w-full bg-gray-100 p-2 sm:p-4 font-sans text-sm">
      
      <div className="flex-1 overflow-y-auto mb-4 bg-white rounded-lg p-2 shadow">
        {messages.map((msg, i) => (
          <div key={i} className={`p-2 m-1 rounded w-fit ${msg.isUser ? "bg-blue-100 ml-auto" : "bg-gray-200 mr-auto"}`} style={{ maxWidth: '90%' }}>
             <pre 
    className="whitespace-pre-wrap font-sans text-left" 
    style={{ wordBreak: 'break-all' }} 
  >
    {msg.text}
  </pre>
            {i === 0 && displayName && (<p className="text-xs text-gray-500 mt-1 text-left">Logged in as: {displayName}</p>)}
            {msg.buttons && (
              <div className="mt-2 flex flex-wrap gap-2 justify-start">
                {msg.buttons.flat().map((btn, btnIdx) => (
                  <button
                    key={btnIdx}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-xs hover:bg-blue-600 disabled:bg-blue-300"
                    onClick={() => handleButtonClick(btn.callback)}
                    disabled={isLoading}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && <div className="p-2 m-1 rounded bg-gray-200 mr-auto animate-pulse w-fit" style={{ maxWidth: '90%' }}><em>Bot is typing...</em></div>}
        <div ref={messagesEndRef} />
      </div>
      
      <CommandButtons onCommand={(cmd) => sendCommand(cmd, false)} />
      
      <form onSubmit={handleSubmit} className="flex mt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter command or text..."
          className="flex-1 p-2 rounded-l border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
        <button type="submit" className="bg-blue-500 text-white p-2 rounded-r hover:bg-blue-600 disabled:bg-blue-300" disabled={isLoading}>
          {isLoading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}

export default ChatWindow;