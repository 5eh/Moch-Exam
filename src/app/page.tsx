"use client";
import * as ethers from "ethers";
import { useState, useEffect, FormEvent as ReactFormEvent } from "react";

interface RequestArguments {
  method: string;
  params?: readonly unknown[];
}

interface EthereumProvider {
  request(args: RequestArguments): Promise<unknown>;
  on(event: "accountsChanged", callback: (accounts: string[]) => void): void;
  on(event: "chainChanged", callback: (chainId: string) => void): void;
  removeListener(
    event: "accountsChanged",
    callback: (accounts: string[]) => void,
  ): void;
  removeListener(
    event: "chainChanged",
    callback: (chainId: string) => void,
  ): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

interface SwitchError extends Error {
  code: number;
}

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  timestamp: number;
}

interface BSCTransaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
}

const Page = () => {
  const [account, setAccount] = useState<string>("");
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [balance, setBalance] = useState<string>("0");
  const [networkError, setNetworkError] = useState<string>("");
  const [recipientAddress, setRecipientAddress] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [txStatus, setTxStatus] = useState<string>("");
  const [txHash, setTxHash] = useState<string>("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const OPBNB_TESTNET_CONFIG = {
    chainId: "0x15eb",
    chainName: "opBNB Testnet",
    nativeCurrency: {
      name: "tBNB",
      symbol: "tBNB",
      decimals: 18,
    },
    rpcUrls: [
      `https://opbnb-testnet.infura.io/v3/${process.env.NEXT_PUBLIC_RPC_URL}`,
    ],
    blockExplorerUrls: ["https://testnet.opbnbscan.com/"],
  };

  const checkAndSwitchNetwork = async () => {
    try {
      if (!window.ethereum) return;
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: OPBNB_TESTNET_CONFIG.chainId }],
        });
      } catch (switchError) {
        if ((switchError as SwitchError).code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [OPBNB_TESTNET_CONFIG],
          });
        } else {
          throw switchError;
        }
      }
      setNetworkError("");
    } catch {
      setNetworkError(
        "Failed to switch to opBNB Testnet. Please switch manually.",
      );
    }
  };

  const getBalance = async (address: string) => {
    try {
      if (!window.ethereum) return;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      if (
        network.chainId !== BigInt(parseInt(OPBNB_TESTNET_CONFIG.chainId, 16))
      ) {
        setNetworkError("Please switch to opBNB Testnet");
        return;
      }
      const balanceWei = await provider.getBalance(address);
      const balanceEth = ethers.formatEther(balanceWei);
      setBalance(parseFloat(balanceEth).toFixed(4));
      setNetworkError("");
    } catch (error) {
      console.error("Error fetching balance:", error);
      setBalance("Error");
    }
  };

  const validateTransaction = (): boolean => {
    setError("");
    if (!ethers.isAddress(recipientAddress)) {
      setError("Invalid recipient address");
      return false;
    }
    try {
      const amountWei = ethers.parseUnits(amount, "wei");
      if (amountWei <= BigInt(0)) {
        setError("Amount must be greater than 0");
        return false;
      }
      const balanceWei = ethers.parseUnits(balance, "ether");
      if (amountWei > balanceWei) {
        setError("Insufficient balance");
        return false;
      }
    } catch {
      setError("Invalid amount");
      return false;
    }
    return true;
  };

  const connectWallet = async (): Promise<void> => {
    try {
      if (!window.ethereum) {
        throw new Error("No wallet found! Please install MetaMask.");
      }

      await checkAndSwitchNetwork();

      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      setAccount(accounts[0]);
      setConnected(true);
      setError("");

      await getBalance(accounts[0]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred",
      );
      setConnected(false);
    }
  };

  const sendTransaction = async (e: ReactFormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateTransaction()) return;

    setIsLoading(true);
    setTxStatus("Initiating transaction...");
    setTxHash("");

    try {
      if (!window.ethereum) throw new Error("No wallet found!");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const tx = {
        to: recipientAddress,
        value: ethers.parseUnits(amount, "wei"),
      };

      setTxStatus("Please confirm the transaction in your wallet...");

      const transaction = await signer.sendTransaction(tx);

      setTxStatus("Transaction submitted! Waiting for confirmation...");
      setTxHash(transaction.hash);

      await transaction.wait();

      setTxStatus("Transaction confirmed!");

      await getBalance(account);

      setAmount("");
      setRecipientAddress("");
    } catch (err) {
      console.error("Transaction error:", err);
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus("Transaction failed!");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        await getBalance(accounts[0]);
      } else {
        setAccount("");
        setConnected(false);
        setBalance("0");
      }
    };

    const handleChainChanged = async (_chainId: string) => {
      if (_chainId !== OPBNB_TESTNET_CONFIG.chainId) {
        setNetworkError("Please switch to opBNB Testnet");
        setBalance("0");
      } else {
        setNetworkError("");
        if (account) {
          await getBalance(account);
        }
      }
    };

    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged,
        );
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [account]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (connected && account) {
      // Check balance every 30 seconds
      intervalId = setInterval(() => {
        getBalance(account);
      }, 30000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [connected, account]);

  useEffect(() => {
    if (connected && account) {
      getLastTransactions(account);
    }
  }, [connected, account]);

  const getLastTransactions = async (address: string) => {
    try {
      if (!process.env.NEXT_PUBLIC_SCAN) {
        console.error("BSC API key not found");
        return;
      }

      const response = await fetch(
        `https://api-testnet.bscscan.com/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=5&sort=desc&apikey=${process.env.NEXT_PUBLIC_SCAN}`,
      );

      const data = await response.json();
      if (data.status === "1" && Array.isArray(data.result)) {
        const formattedTxs = data.result.map((tx: BSCTransaction) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: BigInt(tx.value),
          timestamp: parseInt(tx.timeStamp),
        }));
        setTransactions(formattedTxs);
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
    }
  };
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Connection Section */}
        <div className="mb-8">
          <button
            onClick={connectWallet}
            className={`px-6 py-3 rounded-lg font-medium ${
              connected
                ? "bg-green-600 hover:bg-green-700"
                : "bg-blue-600 hover:bg-blue-700"
            } transition-colors`}
          >
            {connected ? "Connected" : "Connect Wallet"}
          </button>

          {networkError && (
            <div className="mt-4 p-4 bg-red-900/50 rounded-lg border border-red-700">
              <p className="text-red-400">{networkError}</p>
            </div>
          )}
        </div>

        {connected && (
          <>
            {/* Wallet Info */}
            <div className="p-6 bg-gray-800 rounded-lg shadow-xl mb-8">
              <h2 className="text-xl font-bold mb-4">Wallet Details</h2>
              <div className="space-y-2">
                <p>Address: {account.slice(0, 10)}...</p>
                <p>Balance: {balance} tBNB</p>
              </div>
            </div>

            {/* Transaction Form */}
            <div className="p-6 bg-gray-800 rounded-lg shadow-xl mb-8">
              <h2 className="text-xl font-bold mb-4">Send tBNB</h2>
              <form onSubmit={sendTransaction} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 text-white"
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Amount (wei)
                  </label>
                  <input
                    type="text"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Amount in wei..."
                    className="w-full p-3 bg-gray-700 rounded-lg border border-gray-600 focus:ring-2 focus:ring-blue-500 text-white"
                    disabled={isLoading}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full p-3 rounded-lg font-medium ${
                    isLoading ? "bg-gray-600" : "bg-blue-600 hover:bg-blue-700"
                  } transition-colors`}
                >
                  {isLoading ? "Processing..." : "Send tBNB"}
                </button>
              </form>

              {txStatus && (
                <div
                  className={`mt-4 p-4 rounded-lg ${
                    txStatus.includes("failed")
                      ? "bg-red-900/50 border border-red-700"
                      : txStatus.includes("confirmed")
                        ? "bg-green-900/50 border border-green-700"
                        : "bg-blue-900/50 border border-blue-700"
                  }`}
                >
                  <p>{txStatus}</p>
                  {txHash && (
                    <a
                      href={`https://testnet.opbnbscan.com/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline"
                    >
                      View on Explorer
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Transaction History */}
            <div className="p-6 bg-gray-800 rounded-lg shadow-xl">
              <h2 className="text-xl font-bold mb-4">Recent Transactions</h2>
              <div className="space-y-4">
                {transactions.length === 0 ? (
                  <p className="text-gray-400">No recent transactions found</p>
                ) : (
                  transactions.map((tx, index) => (
                    <div
                      key={index}
                      className="p-4 bg-gray-700 rounded-lg border border-gray-600"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <p className="text-gray-300">Hash:</p>
                        <a
                          href={`https://testnet.opbnbscan.com/tx/${tx.hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline"
                        >
                          {tx.hash.slice(0, 10)}...
                        </a>
                        <p className="text-gray-300">From:</p>
                        <p>{tx.from.slice(0, 10)}...</p>
                        <p className="text-gray-300">To:</p>
                        <p>{tx.to?.slice(0, 10) || "Contract Creation"}</p>
                        <p className="text-gray-300">Value:</p>
                        <p>{ethers.formatEther(tx.value)} tBNB</p>
                        {tx.timestamp && (
                          <>
                            <p className="text-gray-300">Time:</p>
                            <p>
                              {new Date(tx.timestamp * 1000).toLocaleString()}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
        {error && (
          <div className="mt-4 p-4 bg-red-900/50 rounded-lg border border-red-700">
            <p className="text-red-400">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Page;
