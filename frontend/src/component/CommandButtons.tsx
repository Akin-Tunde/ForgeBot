interface CommandButtonsProps {
  onCommand: (command: string) => void;
}

function CommandButtons({ onCommand }: CommandButtonsProps) {
  const commands = [
    { label: "Start", command: "/start" },
    { label: "Balance", command: "/balance" },
    { label: "Buy", command: "/buy" },
    { label: "Sell", command: "/sell" },
    { label: "Deposit", command: "/deposit" },
    { label: "Withdraw", command: "/withdraw" },
    { label: "Wallet", command: "/wallet" },
    { label: "Settings", command: "/settings" },
    { label: "Help", command: "/help" },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {commands.map(({ label, command }) => (
        <button
          key={command}
          className="bg-gray-500 text-white px-3 py-1 rounded text-xs hover:bg-gray-600"
          onClick={() => onCommand(command)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default CommandButtons;
