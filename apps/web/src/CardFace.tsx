import type { CSSProperties } from "react";
import type { Card } from "@ferbli/protocol";
import { rankSpriteCol, suitSpriteRow } from "@ferbli/rules";

export function CardFace({
  card,
  faceDown,
}: {
  card: Card | null;
  faceDown?: boolean;
}) {
  if (!card || faceDown) {
    return <div className="card back" aria-label="Hidden card" />;
  }
  const col = rankSpriteCol(card.rank);
  const row = suitSpriteRow(card.suit);
  return (
    <div
      className="card"
      style={
        {
          "--col": col,
          "--row": row,
        } as CSSProperties
      }
      aria-label={`${card.rank} of ${card.suit}`}
    />
  );
}
