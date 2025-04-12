// pages/index.js
import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, web3, BN } from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";

import IDL from "../lib/idl.json";

// Dynamically import WalletMultiButton with SSR disabled
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

const ENV_PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;
const ENV_ICO_MINT = process.env.NEXT_PUBLIC_ICO_MINT;

// Program constants
const PROGRAM_ID = new PublicKey(ENV_PROGRAM_ID);
const ICO_MINT = new PublicKey(ENV_ICO_MINT);
const TOKEN_DECIMALS = new BN(1_000_000_000);

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [icoData, setIcoData] = useState(null);
  const [amount, setAmount] = useState("");
  const [userTokenBalance, setUserTokenBalance] = useState(null);

  useEffect(() => {
    if (wallet.connected) {
      checkIfAdmin();
      fetchIcoData();
      fetchUserTokenBalance();
    }
  }, [wallet.connected]);

  const getProgram = () => {
    if (!wallet.connected) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new Program(IDL, PROGRAM_ID, provider);
  };

  const checkIfAdmin = async () => {
    try {
      const program = getProgram();
      if (!program) return;

      console.log("Checking admin status for:", wallet.publicKey.toString());

      const [dataPda] = await PublicKey.findProgramAddress(
        [Buffer.from("data"), wallet.publicKey.toBuffer()],
        program.programId
      );

      try {
        const data = await program.account.data.fetch(dataPda);
        setIsAdmin(data.admin.equals(wallet.publicKey));
      } catch (e) {
        const accounts = await program.account.data.all();
        if (accounts.length === 0) {
          setIsAdmin(true); // First user becomes admin
        } else {
          setIsAdmin(false);
          setIcoData(accounts[0].account);
        }
      }
    } catch (error) {
      console.error("Error checking admin:", error);
      setIsAdmin(false);
    }
  };

  const fetchIcoData = async () => {
    try {
      const program = getProgram();
      if (!program) return;

      const accounts = await program.account.data.all();
      if (accounts.length > 0) {
        setIcoData(accounts[0].account);
      }
    } catch (error) {
      console.error("Error fetching ICO data:", error);
    }
  };

  const createIcoAta = async () => {
    try {
      if (!amount || parseInt(amount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      setLoading(true);
      const program = getProgram();
      if (!program) return;

      const [icoAtaPda] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        program.programId
      );

      const [dataPda] = await PublicKey.findProgramAddress(
        [Buffer.from("data"), wallet.publicKey.toBuffer()],
        program.programId
      );

      const adminIcoAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey
      );

      await program.methods
        .createIcoAta(new BN(amount))
        .accounts({
          icoAtaForIcoProgram: icoAtaPda,
          data: dataPda,
          icoMint: ICO_MINT,
          icoAtaForAdmin: adminIcoAta,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      alert("ICO initialized successfully!");
      await fetchIcoData();
    } catch (error) {
      console.error("Error initializing ICO:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const depositIco = async () => {
    try {
      if (!amount || parseInt(amount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      setLoading(true);
      const program = getProgram();
      if (!program) return;

      const [icoAtaPda] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        program.programId
      );

      const [dataPda] = await PublicKey.findProgramAddress(
        [Buffer.from("data"), wallet.publicKey.toBuffer()],
        program.programId
      );

      const adminIcoAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey
      );

      await program.methods
        .depositIcoInAta(new BN(amount))
        .accounts({
          icoAtaForIcoProgram: icoAtaPda,
          data: dataPda,
          icoMint: ICO_MINT,
          icoAtaForAdmin: adminIcoAta,
          admin: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      alert("Tokens deposited successfully!");
      await fetchIcoData();
    } catch (error) {
      console.error("Error depositing:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const buyTokens = async () => {
    try {
      if (!amount || parseInt(amount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      setLoading(true);
      const program = getProgram();
      if (!program) return;

      // Calculate cost (0.001 SOL per token)
      const solCost = parseInt(amount) * 0.001;
      const balance = await connection.getBalance(wallet.publicKey);

      if (balance < solCost * 1e9 + 5000) {
        alert(`Insufficient balance. Need ${solCost.toFixed(3)} SOL plus fee`);
        return;
      }

      const [icoAtaPda, bump] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        program.programId
      );

      const [dataPda] = await PublicKey.findProgramAddress(
        [Buffer.from("data"), icoData.admin.toBuffer()],
        program.programId
      );

      const userIcoAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey
      );

      // Create ATA if needed
      try {
        await getAccount(connection, userIcoAta);
      } catch (error) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          userIcoAta,
          wallet.publicKey,
          ICO_MINT
        );
        const transaction = new Transaction().add(createAtaIx);
        await wallet.sendTransaction(transaction, connection);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      await program.methods
        .buyTokens(bump, new BN(amount))
        .accounts({
          icoAtaForIcoProgram: icoAtaPda,
          data: dataPda,
          icoMint: ICO_MINT,
          icoAtaForUser: userIcoAta,
          user: wallet.publicKey,
          admin: icoData.admin,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      alert(`Successfully purchased ${amount} tokens!`);
      await fetchIcoData();
      await fetchUserTokenBalance();
    } catch (error) {
      console.error("Error buying tokens:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserTokenBalance = async () => {
    try {
      if (!wallet.connected) return;

      const userAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey
      );

      try {
        const tokenAccount = await getAccount(connection, userAta);
        setUserTokenBalance(tokenAccount.amount.toString());
      } catch (e) {
        // If ATA doesn't exist, balance is 0
        setUserTokenBalance("0");
      }
    } catch (error) {
      console.error("Error fetching token balance:", error);
      setUserTokenBalance("0");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 text-white py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-5xl sm:mx-auto">
        <div className="relative px-6 py-10 bg-gray-900 shadow-xl rounded-3xl sm:p-20 border border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {/* Left Column: Token Form */}
            <div>
              <div className="divide-y divide-gray-700">
                {/* Header Section */}
                <div className="pb-8">
                  <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
                      SOLANA ICO
                    </h1>
                    <WalletMultiButton className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg shadow-lg hover:opacity-90 transition-opacity" />
                  </div>
                  {wallet.connected && (
                    <div className="mt-4 text-sm text-gray-400">
                      <p>
                        Wallet:{" "}
                        <span className="font-mono">
                          {wallet.publicKey.toString().slice(0, 8)}...
                          {wallet.publicKey.toString().slice(-8)}
                        </span>
                      </p>
                      <p className="mt-1">
                        Status:{" "}
                        <span
                          className={`font-semibold ${
                            isAdmin ? "text-green-400" : "text-blue-400"
                          }`}
                        >
                          {isAdmin ? "Admin" : "User"}
                        </span>
                      </p>
                      <p className="mt-2 p-2 bg-gray-800 rounded-lg">
                        <span className="text-gray-400">Your Token Balance:</span>{" "}
                        <span className="font-semibold text-white">
                          {userTokenBalance
                            ? (Number(userTokenBalance) / 1e9).toFixed(2)
                            : "0"}{" "}
                          tokens
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Token Form */}
                {wallet.connected && (
                  <div className="py-8">
                    <div className="space-y-4">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={isAdmin ? "Enter token amount" : "Buy tokens"}
                        className="w-full p-3 bg-gray-800 text-white border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        min="1"
                        step="1"
                      />

                      {/* Action Buttons */}
                      {isAdmin ? (
                        <div className="space-y-3">
                          {!icoData && (
                            <button
                              onClick={createIcoAta}
                              disabled={loading}
                              className="w-full p-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg shadow-lg hover:opacity-90 disabled:bg-gray-600 transition-opacity"
                            >
                              {loading ? "Initializing..." : "Initialize ICO"}
                            </button>
                          )}
                          {icoData && (
                            <>
                              <button
                                onClick={depositIco}
                                disabled={loading}
                                className="w-full p-3 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-lg shadow-lg hover:opacity-90 disabled:bg-gray-600 transition-opacity"
                              >
                                {loading ? "Depositing..." : "Deposit Tokens"}
                              </button>
                              <button
                                onClick={buyTokens}
                                disabled={loading || !icoData}
                                className="w-full p-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg shadow-lg hover:opacity-90 disabled:bg-gray-600 transition-opacity"
                              >
                                {loading ? "Processing..." : "Buy Tokens"}
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={buyTokens}
                          disabled={loading || !icoData}
                          className="w-full p-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg shadow-lg hover:opacity-90 disabled:bg-gray-600 transition-opacity"
                        >
                          {loading ? "Processing..." : "Buy Tokens"}
                        </button>
                      )}

                      {/* Transaction Status */}
                      {loading && (
                        <div className="text-center animate-pulse text-gray-400">
                          Processing transaction...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Not Connected State */}
                {!wallet.connected && (
                  <div className="py-8 text-center text-gray-400">
                    Please connect your wallet to continue
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Token Details */}
            <div>
              <div className="p-6 bg-gray-800 rounded-lg border border-gray-700 shadow-lg">
                <h2 className="text-lg font-semibold text-purple-400 mb-4">
                  Token Details
                </h2>
                {icoData ? (
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total Supply:</span>
                      <span className="font-medium text-white">
                        {icoData.totalTokens.toString()} tokens
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Tokens Sold:</span>
                      <span className="font-medium text-white">
                        {icoData.tokensSold.toString()} tokens
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Token Price:</span>
                      <span className="font-medium text-white">0.001 SOL</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Available:</span>
                      <span className="font-medium text-white">
                        {(
                          icoData.totalTokens - icoData.tokensSold
                        ).toString()}{" "}
                        tokens
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400">No ICO data available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
