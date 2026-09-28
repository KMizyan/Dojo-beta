'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

type CourseArea = 'Pure' | 'Statistics' | 'Mechanics';
type Exposure = 'any' | 'unseen' | 'once' | 'few' | 'explored';

const topicGroups: Record<CourseArea, string[]> = {
  Pure: [
    'Proof',
    'Algebra & Functions',
    'Coordinate Geometry',
    'Sequences & Series',
    'Trigonometry',
    'Exponentials & Logarithms',
    'Differentiation',
    'Integration',
    'Numerical Methods',
    'Vectors',
  ],
  Statistics: [],
  Mechanics: [],
};

const exposureChoices: { id: Exposure; label: string; detail: string }[] = [
  {
    id: 'any',
    label: 'Any',
    detail: 'Use the full selected topic range',
  },
  {
    id: 'unseen',
    label: 'Not encountered',
    detail: 'Question types you have not met yet',
  },
  {
    id: 'once',
    label: 'Seen once',
    detail: 'Question types you have only encountered once',
  },
  {
    id: 'few',
    label: 'Seen a few times',
    detail: 'Question types with some exposure',
  },
  {
    id: 'explored',
    label: 'Well explored',
    detail: 'Question types you have encountered repeatedly',
  },
];

function validExposure(value: string): value is Exposure {
  return ['any', 'unseen', 'once', 'few', 'explored'].includes(value);
}

function QuestionSetsContent() {
  const searchParams = useSearchParams();

  const incomingTopics = useMemo(() => {
    const raw = searchParams.get('topics');

    if (!raw) return [];

    return raw
      .split(',')
      .map((topic) => topic.trim())
      .filter(Boolean);
  }, [searchParams]);

  const incomingExposure = useMemo<Exposure[]>(() => {
    const raw = searchParams.get('exposure');

    if (!raw) return ['any'];

    const values = raw
      .split(',')
      .map((value) => value.trim())
      .filter(validExposure);

    return values.length ? values : ['any'];
  }, [searchParams]);

  const cameFromCoverage = searchParams.get('source') === 'coverage';

  const [courseArea, setCourseArea] = useState<CourseArea>('Pure');
  const [setTopics, setSetTopics] = useState<string[]>(incomingTopics);
  const [exposures, setExposures] = useState<Exposure[]>(incomingExposure);
  const [setCount, setSetCount] = useState(10);
  const [setNote, setSetNote] = useState('');

  const topics = topicGroups[courseArea];

  function toggleTopic(topic: string) {
    setSetTopics((current) =>
      current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic]
    );
  }

  function toggleExposure(exposure: Exposure) {
    if (exposure === 'any') {
      setExposures(['any']);
      return;
    }

    setExposures((current) => {
      const withoutAny = current.filter((item) => item !== 'any');

      if (withoutAny.includes(exposure)) {
        const next = withoutAny.filter((item) => item !== exposure);
        return next.length ? next : ['any'];
      }

      return [...withoutAny, exposure];
    });
  }

  const canStart = setTopics.length > 0;

  const practiceHref = canStart
    ? `/practice?topic=${encodeURIComponent(
        setTopics.join(' + ')
      )}&topics=${encodeURIComponent(
        setTopics.join(',')
      )}&count=${setCount}&mode=practice&ask=1&solutions=1&freeNav=1&brief=${encodeURIComponent(
        setNote
      )}&exposure=${encodeURIComponent(exposures.join(','))}`
    : '#';

  return (
    <main className="questionSetsV2Page">
      <header className="questionSetsV2Header">
        <div className="page-kicker">A-level Mathematics</div>
        <h1>Question Sets</h1>
        <p>
          Choose the part of the course you want to work on and the kinds of
          questions you want included.
        </p>
      </header>

      {cameFromCoverage && (
        <section className="coverageImportCard">
          <div>
            <span className="questionSetMiniLabel">From Coverage</span>
            <h2>Your coverage selection is ready.</h2>
            <p>
              We've brought your selected topics and exposure level across.
              Adjust anything below or start the set as it is.
            </p>
          </div>

          <div className="coverageImportSummary">
            <div>
              <span>Topics</span>
              <strong>
                {setTopics.length ? setTopics.join(', ') : 'None selected'}
              </strong>
            </div>

            <div>
              <span>Question types</span>
              <strong>
                {exposures
                  .map(
                    (id) =>
                      exposureChoices.find((choice) => choice.id === id)
                        ?.label ?? id
                  )
                  .join(', ')}
              </strong>
            </div>
          </div>
        </section>
      )}

      <section className="questionSetConfig">
        <div className="questionSetSection">
          <div className="questionSetSectionHeading">
            <span className="questionSetStep">01</span>
            <div>
              <h2>Choose the course area</h2>
              <p>Start broad, then choose the topics below.</p>
            </div>
          </div>

          <div className="questionSetCourseGrid">
            {(['Pure', 'Statistics', 'Mechanics'] as CourseArea[]).map(
              (area) => (
                <button
                  key={area}
                  className={courseArea === area ? 'active' : ''}
                  onClick={() => setCourseArea(area)}
                >
                  <strong>{area}</strong>
                  <span>
                    {area === 'Pure'
                      ? 'Available now'
                      : 'Question banks coming later'}
                  </span>
                </button>
              )
            )}
          </div>
        </div>

        <div className="questionSetSection">
          <div className="questionSetSectionHeading">
            <span className="questionSetStep">02</span>
            <div>
              <h2>Choose topics</h2>
              <p>Select one topic or combine several into the same set.</p>
            </div>
          </div>

          {topics.length ? (
            <div className="questionSetTopicGrid">
              {topics.map((topic) => {
                const selected = setTopics.includes(topic);

                return (
                  <button
                    key={topic}
                    className={selected ? 'active' : ''}
                    onClick={() => toggleTopic(topic)}
                  >
                    <span className="questionSetCheckbox">
                      {selected ? '✓' : ''}
                    </span>
                    <strong>{topic}</strong>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="questionSetUnavailable">
              {courseArea} question banks haven't been added yet.
            </div>
          )}
        </div>

        <div className="questionSetSection">
          <div className="questionSetSectionHeading">
            <span className="questionSetStep">03</span>
            <div>
              <h2>Choose question types</h2>
              <p>
                Use your Coverage history to control how familiar the
                questions should be.
              </p>
            </div>
          </div>

          <div className="questionSetExposureGrid">
            {exposureChoices.map((choice) => {
              const selected = exposures.includes(choice.id);

              return (
                <button
                  key={choice.id}
                  className={selected ? 'active' : ''}
                  onClick={() => toggleExposure(choice.id)}
                >
                  <span className={`questionSetExposureDot ${choice.id}`} />

                  <span>
                    <strong>{choice.label}</strong>
                    <small>{choice.detail}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="questionSetSection questionSetFinalSection">
          <div className="questionSetSectionHeading">
            <span className="questionSetStep">04</span>
            <div>
              <h2>Set size</h2>
              <p>Choose how many questions you want.</p>
            </div>
          </div>

          <div className="questionSetCountRow">
            {[5, 10, 15, 20].map((count) => (
              <button
                key={count}
                className={setCount === count ? 'active' : ''}
                onClick={() => setSetCount(count)}
              >
                {count}
              </button>
            ))}
          </div>

          <div className="questionSetContext">
            <label htmlFor="question-set-context">
              Anything else DOJO should know?
              <span>Optional</span>
            </label>

            <textarea
              id="question-set-context"
              value={setNote}
              onChange={(event) => setSetNote(event.target.value)}
              placeholder="e.g. My class is revising trig identities, but we haven't covered small-angle approximations yet."
            />
          </div>
        </div>
      </section>

      <aside className="questionSetLaunchBar">
        <div>
          <span className="questionSetMiniLabel">Your set</span>

          <strong>
            {setTopics.length
              ? `${setCount} questions · ${setTopics.join(', ')}`
              : 'Choose at least one topic'}
          </strong>

          {setTopics.length > 0 && (
            <small>
              {exposures.includes('any')
                ? 'Any question type'
                : exposureChoices
                    .filter((choice) => exposures.includes(choice.id))
                    .map((choice) => choice.label)
                    .join(' · ')}
            </small>
          )}
        </div>

        <Link
          href={practiceHref}
          aria-disabled={!canStart}
          className={`questionSetStartButton ${
            !canStart ? 'disabled' : ''
          }`}
        >
          Start question set →
        </Link>
      </aside>
    </main>
  );
}

export default function QuestionSetsPage() {
  return (
    <Suspense
      fallback={
        <main className="questionSetsV2Page">
          <header className="questionSetsV2Header">
            <div className="page-kicker">A-level Mathematics</div>
            <h1>Question Sets</h1>
            <p>Loading your question set...</p>
          </header>
        </main>
      }
    >
      <QuestionSetsContent />
    </Suspense>
  );
}


