import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Press | Djinn",
  description:
    "Djinn Protocol in the news. Articles, interviews, and media coverage about the decentralized sports intelligence marketplace on Bittensor.",
  openGraph: {
    title: "Djinn Protocol - Press",
    description:
      "Articles, interviews, and media coverage about Djinn Protocol.",
  },
};

interface Article {
  title: string;
  source: string;
  date: string;
  url: string;
  description: string;
  image?: string;
  tag: "article" | "interview" | "ecosystem";
}

const ARTICLES: Article[] = [
  {
    title: "Djinn Subnet (SN103) Sets New Bitstarter Record, Raising 600 TAO in 51 Minutes",
    source: "TAO Daily",
    date: "Jan 24, 2026",
    url: "https://taodaily.io/djinn-subnet-sn103-sets-new-bitstarter-record-raising-600-tao-in-51-minutes/",
    description:
      "Djinn achieved a record on Bittensor\u2019s crowdfunding platform, completing its 600 TAO fundraise in under an hour \u2014 the fastest Bitstarter raise to date.",
    image: "https://taodaily.io/wp-content/uploads/2026/01/taodailyy-6.png",
    tag: "article",
  },
  {
    title: "OUTsider INsights #9 \u2014 Zach Talks to Tao Outsider",
    source: "TAO Daily",
    date: "Feb 17, 2026",
    url: "https://taodaily.io/outsider-insights-9-zach-talks-to-tao-outsider/",
    description:
      "Interview with Chris Zacharia discussing the Bittensor ecosystem, Bitstarter, and the subnets launching through the platform including Djinn.",
    image: "https://taodaily.io/wp-content/uploads/2026/02/outsider-insights.png",
    tag: "interview",
  },
  {
    title: "DJINN SUBNET 103: Bittensor\u2019s Industrial Cloud Execution",
    source: "SubnetEdge",
    date: "Jan 2026",
    url: "https://subnetedge.substack.com/p/djinn-subnet-103-bittensors-industrial",
    description:
      "Deep dive into Djinn\u2019s architecture, the team behind it, its partnership with Tensora Group, and its positioning as a decentralized intelligence marketplace.",
    tag: "article",
  },
  {
    title: "Bitstarter Kicks Off First Crowdfunding Platform for Bittensor With Livestream Investment Round",
    source: "The Block",
    date: "Jan 2026",
    url: "https://www.theblock.co/press-releases/379945/bitstarter-kicks-off-first-crowdfunding-platform-for-bittensor-with-livestream-investment-round",
    description:
      "Coverage of the Bitstarter platform launch, the crowdfunding mechanism through which Djinn raised its initial funding on Bittensor.",
    tag: "ecosystem",
  },
  {
    title: "The Apprentice: Bittensor Edition",
    source: "A Bittensor Journey",
    date: "Jan 2026",
    url: "https://www.abittensorjourney.com/p/the-apprentice-bittensor-edition",
    description:
      "Analysis of Bitstarter as an incubator for Bittensor subnets, featuring Djinn as one of the key launches.",
    tag: "ecosystem",
  },
];

const TAG_STYLES: Record<Article["tag"], { bg: string; text: string; label: string }> = {
  article: { bg: "bg-idiot-100", text: "text-idiot-700", label: "Article" },
  interview: { bg: "bg-genius-100", text: "text-genius-700", label: "Interview" },
  ecosystem: { bg: "bg-slate-100", text: "text-slate-600", label: "Ecosystem" },
};

export default function Press() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-16">
        <div className="flex items-center gap-3 justify-center mb-4">
          <Image
            src="/djinn-logo.png"
            alt="Djinn"
            width={44}
            height={44}
            className="w-11 h-11"
          />
          <span className="text-3xl sm:text-4xl font-bold text-slate-900 font-wordmark tracking-wide">
            DJINN
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
          Press &amp; Media
        </h1>
        <p className="text-lg text-slate-500 max-w-2xl mx-auto">
          Coverage, interviews, and articles about Djinn Protocol and the
          decentralized sports intelligence marketplace on Bittensor Subnet 103.
        </p>
      </div>

      {/* Featured articles (first two with images) */}
      <section className="mb-12">
        <div className="grid md:grid-cols-2 gap-6">
          {ARTICLES.filter((a) => a.image).map((article) => (
            <a
              key={article.url}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group card !p-0 overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="aspect-video relative bg-slate-100 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={article.image}
                  alt={article.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${TAG_STYLES[article.tag].bg} ${TAG_STYLES[article.tag].text}`}
                  >
                    {TAG_STYLES[article.tag].label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {article.source}
                  </span>
                  <span className="text-xs text-slate-300">&middot;</span>
                  <span className="text-xs text-slate-400">
                    {article.date}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2 group-hover:text-idiot-600 transition-colors">
                  {article.title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {article.description}
                </p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Remaining articles */}
      <section className="mb-16">
        <div className="space-y-4">
          {ARTICLES.filter((a) => !a.image).map((article) => (
            <a
              key={article.url}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group card flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${TAG_STYLES[article.tag].bg} ${TAG_STYLES[article.tag].text}`}
                  >
                    {TAG_STYLES[article.tag].label}
                  </span>
                  <span className="text-xs text-slate-400">
                    {article.source}
                  </span>
                  <span className="text-xs text-slate-300">&middot;</span>
                  <span className="text-xs text-slate-400">
                    {article.date}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-idiot-600 transition-colors">
                  {article.title}
                </h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {article.description}
                </p>
              </div>
              <svg
                className="w-5 h-5 text-slate-300 group-hover:text-idiot-500 shrink-0 transition-colors hidden sm:block"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          ))}
        </div>
      </section>

      {/* Directory listings */}
      <section className="mb-16">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          Directories &amp; Tracking
        </h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              name: "Subnet Alpha",
              url: "https://subnetalpha.ai/subnet/djinn/",
              desc: "Subnet directory listing",
            },
            {
              name: "Taostats",
              url: "https://taostats.io/subnets",
              desc: "Network explorer",
            },
            {
              name: "Bitstarter",
              url: "https://app.bitstarter.ai/subnets/",
              desc: "Crowdfunding platform",
            },
          ].map(({ name, url, desc }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="card !p-4 text-center hover:shadow-lg transition-shadow group"
            >
              <h4 className="font-semibold text-slate-900 group-hover:text-idiot-600 transition-colors">
                {name}
              </h4>
              <p className="text-xs text-slate-400 mt-1">{desc}</p>
            </a>
          ))}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="text-center pb-8">
        <div className="card bg-slate-50 !border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-2">
            Media Inquiries
          </h2>
          <p className="text-sm text-slate-500">
            For press inquiries, interviews, or partnership opportunities, reach
            out on{" "}
            <a
              href="https://x.com/djaboratory"
              target="_blank"
              rel="noopener noreferrer"
              className="text-idiot-600 hover:text-idiot-700 underline underline-offset-2"
            >
              X @djaboratory
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
