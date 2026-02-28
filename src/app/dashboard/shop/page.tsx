"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStreak, purchaseFreeze, getFreezeCost, canAffordFreeze } from "@/lib/storage";

export default function ShopPage() {
  const [streakData, setStreakData] = useState(() => getStreak());
  const [message, setMessage] = useState("");

  useEffect(() => {
    setStreakData(getStreak());
  }, []);

  function handlePurchase() {
    if (!canAffordFreeze()) {
      setMessage("Not enough points. Earn points by studying!");
      return;
    }
    if (streakData.freezes >= streakData.maxFreezes) {
      setMessage(`You already have the max (${streakData.maxFreezes}) freezes.`);
      return;
    }
    if (purchaseFreeze()) {
      setStreakData(getStreak());
      setMessage("Streak Freeze purchased!");
    } else {
      setMessage("Purchase failed.");
    }
  }

  const cost = getFreezeCost();
  const points = streakData.points ?? 0;
  const canBuy = points >= cost && streakData.freezes < streakData.maxFreezes;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <Link href="/dashboard" className="text-dusty-blue font-medium hover:underline">
          ← Dashboard
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-deep-charcoal">Shop</h1>
      </div>

      <div className="rounded-card border border-warm-sand/80 bg-cream p-6 shadow-subtle">
        <p className="text-sm text-deep-charcoal/80 mb-4">
          You have <strong>{points} points</strong>. Earn 10 points per day of study activity.
        </p>
        <p className="text-sm text-deep-charcoal/80 mb-6">
          Streak Freezes: {streakData.freezes} / {streakData.maxFreezes}
        </p>

        <div className="rounded-card border-2 border-dusty-blue/30 bg-dusty-blue/5 p-6">
          <h2 className="font-semibold text-deep-charcoal">Streak Freeze</h2>
          <p className="mt-2 text-sm text-deep-charcoal/80">
            Protect your streak on a day you can&apos;t study. Auto-used when you miss a day.
          </p>
          <p className="mt-2 text-sm font-medium text-dusty-blue">
            {cost} points
          </p>
          <button
            onClick={handlePurchase}
            disabled={!canBuy}
            className="mt-4 rounded-button bg-dusty-blue px-6 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Purchase
          </button>
        </div>

        {message && (
          <p className="mt-4 text-sm text-terracotta">{message}</p>
        )}
      </div>
    </div>
  );
}
