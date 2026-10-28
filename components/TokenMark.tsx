"use client";

import { useState } from "react";

export function TokenMark({ symbol, imageUrl }: { symbol: string; imageUrl: string | null }) {
  const [failed, setFailed] = useState(false);
  if (imageUrl && !failed) {
    return (
      // Token logos are third-party and often hotlink-sensitive.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="mark-img"
        src={imageUrl}
        alt=""
        width={42}
        height={42}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="ph">{(symbol || "?").slice(0, 1).toUpperCase()}</span>;
}
