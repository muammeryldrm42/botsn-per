import Link from "next/link";

export default function NotFound() {
  return (
    <div className="panel">
      <p className="kicker">404</p>
      <h1>Bu sayfa yok</h1>
      <p className="lede">Aradığın token veya sayfa bulunamadı.</p>
      <p>
        <Link href="/">Canlı masaya dön</Link>
      </p>
    </div>
  );
}
