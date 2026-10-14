import {
  ArrowRight,
  AudioLines,
  Infinity,
  ListVideo,
  Headphones,
} from "lucide-react";
export default function ImmersionBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="immersion">
      <div className="immersion-art">
        <Headphones />
      </div>
      <div className="immersion-copy">
        <h2>IMMERSION MODE</h2>
        <p>A personalized, continuous viewing experience.</p>
      </div>
      <div className="feature">
        <AudioLines />
        <span>
          Adaptive Ambience<small>Planned feature</small>
        </span>
      </div>
      <div className="feature">
        <Infinity />
        <span>
          Non-Stop Edits<small>Continuous discovery</small>
        </span>
      </div>
      <div className="feature">
        <ListVideo />
        <span>
          Build Your Queue<small>Your sequence of edits</small>
        </span>
      </div>
      <button className="primary" onClick={onOpen}>
        Enter Immersion
        <ArrowRight size={18} />
      </button>
    </section>
  );
}
