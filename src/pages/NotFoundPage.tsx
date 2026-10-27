import { ArrowLeft } from "lucide-react";
import { paths } from "../lib/router";
import { LogoMark } from "../ui/Logo";

export default function NotFoundPage({ title = "Page not found", message = "That link doesn't lead anywhere in Curie." }: { title?: string; message?: string }) {
  return <div className="flex flex-col items-center px-4 py-24 text-center">
    <div className="animate-float mb-6 opacity-80"><LogoMark size={64} /></div>
    <h1 className="font-display text-3xl font-bold">{title}</h1>
    <p className="mt-2 text-base-content/60">{message}</p>
    <a href={paths.library} className="btn btn-primary mt-6 press"><ArrowLeft size={16} /> Back to library</a>
  </div>;
}
