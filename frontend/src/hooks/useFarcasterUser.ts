import { sdk } from "@farcaster/frame-sdk";
import { useEffect, useState } from "react";

export function useFarcasterUser() {
  const [user, setUser] = useState<{
    fid: number;
    username?: string;
    pfpUrl?: string;
  } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const context = await sdk.context;
      if (context.user) setUser(context.user);
    };
    fetchUser();
  }, []);

  return user;
}