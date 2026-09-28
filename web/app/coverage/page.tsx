'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Exposure = 'unseen' | 'once' | 'few' | 'explored';
type CourseArea = 'Pure' | 'Statistics' | 'Mechanics';

type Architecture = {
  id: string;
  name: string;
  seen: number;
};

type Subtopic = {
  id: string;
  name: string;
  architectures: Architecture[];
};

type Topic = {
  id: string;
  name: string;
  courseArea: CourseArea;
  subtopics: Subtopic[];
};

const topics: Topic[] = [
  {
    id: 'proof',
    name: 'Proof',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'proof',
        name: 'Proof',
        architectures: [
          { id: 'odd_square_minus_one', name: 'Odd integer divisibility', seen: 3 },
          { id: 'counterexample', name: 'Proof by counterexample', seen: 1 },
          { id: 'contradiction', name: 'Proof by contradiction', seen: 0 },
        ],
      },
    ],
  },
  {
    id: 'algebra-functions',
    name: 'Algebra & Functions',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'factor-theorem',
        name: 'Factor Theorem',
        architectures: [
          { id: 'factor_parameter', name: 'Parameter from a known factor', seen: 4 },
          { id: 'factorise-polynomial', name: 'Factorise using the factor theorem', seen: 2 },
        ],
      },
      {
        id: 'quadratics',
        name: 'Quadratics',
        architectures: [
          { id: 'quadratic-conditions', name: 'Conditions on roots', seen: 1 },
          { id: 'quadratic-transform', name: 'Transforming a quadratic', seen: 0 },
        ],
      },
    ],
  },
  {
    id: 'coordinate-geometry',
    name: 'Coordinate Geometry',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'straight-lines',
        name: 'Straight Lines',
        architectures: [
          { id: 'line_through_two_points', name: 'Line through two points', seen: 5 },
          { id: 'perpendicular_triangle_area', name: 'Perpendicular line geometry', seen: 1 },
        ],
      },
      {
        id: 'circles',
        name: 'Circles',
        architectures: [
          { id: 'circle-equation', name: 'Equation of a circle', seen: 3 },
          { id: 'circle-tangent', name: 'Tangents to circles', seen: 2 },
          { id: 'circle-intersection', name: 'Line-circle intersections', seen: 0 },
        ],
      },
    ],
  },
  {
    id: 'sequences-series',
    name: 'Sequences & Series',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'arithmetic',
        name: 'Arithmetic Sequences',
        architectures: [
          { id: 'arithmetic_model', name: 'Arithmetic sequence modelling', seen: 3 },
          { id: 'arithmetic-sum', name: 'Arithmetic series', seen: 1 },
        ],
      },
      {
        id: 'geometric',
        name: 'Geometric Sequences',
        architectures: [
          { id: 'geometric-model', name: 'Geometric sequence modelling', seen: 2 },
          { id: 'geometric-sum', name: 'Geometric series', seen: 0 },
        ],
      },
    ],
  },
  {
    id: 'trigonometry',
    name: 'Trigonometry',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'identities',
        name: 'Trigonometric Identities',
        architectures: [
          { id: 'prove_identity', name: 'Proving identities', seen: 5 },
          { id: 'r_form', name: 'R-form', seen: 2 },
        ],
      },
      {
        id: 'equations',
        name: 'Trigonometric Equations',
        architectures: [
          { id: 'solve-trig-equation', name: 'Solving trig equations', seen: 3 },
          { id: 'identity-then-solve', name: 'Identity then solve', seen: 1 },
        ],
      },
    ],
  },
  {
    id: 'exp-logs',
    name: 'Exponentials & Logarithms',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'laws-logs',
        name: 'Laws of Logarithms',
        architectures: [
          { id: 'substitution_log_solve', name: 'Log substitution', seen: 4 },
          { id: 'combine-logs', name: 'Combining logarithms', seen: 2 },
        ],
      },
      {
        id: 'exponential-equations',
        name: 'Exponential Equations',
        architectures: [
          { id: 'exponential-solve', name: 'Solve exponential equations', seen: 1 },
          { id: 'exponential-model', name: 'Exponential modelling', seen: 0 },
        ],
      },
    ],
  },
  {
    id: 'integration',
    name: 'Integration',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'basic-integration',
        name: 'Basic Integration',
        architectures: [
          { id: 'mixed_power_direct_integral', name: 'Direct integration', seen: 5 },
        ],
      },
      {
        id: 'definite-integration',
        name: 'Definite Integration',
        architectures: [
          { id: 'exact_integral', name: 'Exact definite integrals', seen: 3 },
          { id: 'area-integral', name: 'Area using integration', seen: 1 },
        ],
      },
      {
        id: 'integration-techniques',
        name: 'Integration Techniques',
        architectures: [
          { id: 'substitution', name: 'Integration by substitution', seen: 0 },
          { id: 'parts', name: 'Integration by parts', seen: 0 },
        ],
      },
    ],
  },
  {
    id: 'numerical-methods',
    name: 'Numerical Methods',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'numerical-methods',
        name: 'Numerical Methods',
        architectures: [
          { id: 'two_positive_roots_bracketing', name: 'Locating roots by sign change', seen: 2 },
          { id: 'iteration', name: 'Iteration', seen: 1 },
          { id: 'newton-raphson', name: 'Newton-Raphson', seen: 0 },
        ],
      },
    ],
  },
  {
    id: 'vectors',
    name: 'Vectors',
    courseArea: 'Pure',
    subtopics: [
      {
        id: 'vectors',
        name: 'Vectors',
        architectures: [
          { id: 'triangle_chain_and_section', name: 'Vector chains & sections', seen: 4 },
          { id: 'vector-lines', name: 'Vector line problems', seen: 2 },
          { id: 'vector-geometry', name: 'Geometric vector reasoning', seen: 0 },
        ],
      },
    ],
  },
];

const exposureOptions: { id: Exposure; label: string }[] = [
  { id: 'unseen', label: 'Not encountered' },
  { id: 'once', label: 'Seen once' },
  { id: 'few', label: 'Seen a few times' },
  { id: 'explored', label: 'Well explored' },
];

function exposureFor(seen: number): Exposure {
  if (seen === 0) return 'unseen';
  if (seen === 1) return 'once';
  if (seen <= 3) return 'few';
  return 'explored';
}

function architectureCounts(topic: Topic) {
  const architectures = topic.subtopics.flatMap((x) => x.architectures);

  return {
    encountered: architectures.filter((x) => x.seen > 0).length,
    total: architectures.length,
  };
}

export default function CoveragePage() {
  const [courseArea, setCourseArea] = useState<CourseArea>('Pure');
  const [openTopic, setOpenTopic] = useState<string | null>('integration');

  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedExposure, setSelectedExposure] = useState<Exposure[]>([
    'unseen',
  ]);

  const visibleTopics = useMemo(
    () => topics.filter((topic) => topic.courseArea === courseArea),
    [courseArea]
  );

  function toggleTopic(topicName: string) {
    setSelectedTopics((current) =>
      current.includes(topicName)
        ? current.filter((name) => name !== topicName)
        : [...current, topicName]
    );
  }

  function toggleExposure(exposure: Exposure) {
    setSelectedExposure((current) =>
      current.includes(exposure)
        ? current.filter((item) => item !== exposure)
        : [...current, exposure]
    );
  }

  const canBuild = selectedTopics.length > 0 && selectedExposure.length > 0;

  const questionSetHref = canBuild
    ? `/question-sets?source=coverage&topics=${encodeURIComponent(
        selectedTopics.join(',')
      )}&exposure=${encodeURIComponent(selectedExposure.join(','))}`
    : '#';

  return (
    <main className="coverageV2Page">
      <header className="coverageV2Header">
        <div className="page-kicker">Your A-level Mathematics</div>
        <h1>Coverage</h1>
        <p>
          See which kinds of questions you've encountered, then use the gaps
          to decide what to practise next.
        </p>
      </header>

      <section className="coverageSetLauncher">
        <div className="coverageSetLauncherIntro">
          <span className="coverageMiniLabel">Build from your coverage</span>
          <h2>What do you want to practise?</h2>
          <p>
            Select some topics and the level of exposure you want DOJO to
            pull from.
          </p>
        </div>

        <div className="coverageLauncherControls">
          <div>
            <span className="coverageControlLabel">Question types</span>

            <div className="coverageFilterRow">
              {exposureOptions.map((option) => (
                <button
                  key={option.id}
                  className={`coverageFilter ${
                    selectedExposure.includes(option.id) ? 'active' : ''
                  }`}
                  onClick={() => toggleExposure(option.id)}
                >
                  <span className={`coverageFilterDot ${option.id}`} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="coverageLauncherBottom">
            <div>
              <span className="coverageControlLabel">Selected topics</span>
              <div className="coverageSelectedSummary">
                {selectedTopics.length
                  ? selectedTopics.join(', ')
                  : 'Select topics below'}
              </div>
            </div>

            <Link
              href={questionSetHref}
              aria-disabled={!canBuild}
              className={`coverageBuildButton ${
                !canBuild ? 'disabled' : ''
              }`}
            >
              Build question set →
            </Link>
          </div>
        </div>
      </section>

      <nav className="coverageCourseTabs" aria-label="Course area">
        {(['Pure', 'Statistics', 'Mechanics'] as CourseArea[]).map((area) => (
          <button
            key={area}
            className={courseArea === area ? 'active' : ''}
            onClick={() => {
              setCourseArea(area);
              setOpenTopic(null);
            }}
          >
            <strong>{area}</strong>
            <span>
              {area === 'Pure'
                ? 'Explore topics'
                : 'Question banks coming later'}
            </span>
          </button>
        ))}
      </nav>

      {courseArea !== 'Pure' ? (
        <section className="coverageEmptyCourse">
          <span className="coverageMiniLabel">{courseArea}</span>
          <h2>{courseArea} coverage will live here.</h2>
          <p>
            The Coverage structure already supports this branch. It will
            populate when the {courseArea.toLowerCase()} question banks are
            added.
          </p>
        </section>
      ) : (
        <section className="coverageExplorer">
          <div className="coverageExplorerHeading">
            <div>
              <span className="coverageMiniLabel">Pure mathematics</span>
              <h2>Explore your coverage</h2>
            </div>

            <span className="coverageExplorerHint">
              Select topics for practice or open them to explore
            </span>
          </div>

          <div className="coverageTopicList">
            {visibleTopics.map((topic) => {
              const counts = architectureCounts(topic);
              const isOpen = openTopic === topic.id;
              const isSelected = selectedTopics.includes(topic.name);

              return (
                <article
                  key={topic.id}
                  className={`coverageTopicRow ${isOpen ? 'open' : ''}`}
                >
                  <div className="coverageTopicMain">
                    <button
                      className={`coverageTopicCheck ${
                        isSelected ? 'selected' : ''
                      }`}
                      onClick={() => toggleTopic(topic.name)}
                      aria-label={`Select ${topic.name} for practice`}
                    >
                      {isSelected ? '✓' : ''}
                    </button>

                    <button
                      className="coverageTopicOpen"
                      onClick={() =>
                        setOpenTopic((current) =>
                          current === topic.id ? null : topic.id
                        )
                      }
                    >
                      <div>
                        <strong>{topic.name}</strong>
                        <span>
                          {counts.encountered} of {counts.total} question types
                          encountered
                        </span>
                      </div>

                      <div className="coverageTopicRight">
                        <span className="coverageFraction">
                          {counts.encountered}/{counts.total}
                        </span>
                        <span className="coverageChevron">
                          {isOpen ? '−' : '+'}
                        </span>
                      </div>
                    </button>
                  </div>

                  {isOpen && (
                    <div className="coverageTopicDetail">
                      {topic.subtopics.map((subtopic) => (
                        <div
                          className="coverageSubtopic"
                          key={subtopic.id}
                        >
                          <div className="coverageSubtopicHeading">
                            <strong>{subtopic.name}</strong>
                            <span>
                              {
                                subtopic.architectures.filter(
                                  (architecture) => architecture.seen > 0
                                ).length
                              }
                              /{subtopic.architectures.length}
                            </span>
                          </div>

                          <div className="coverageArchitectureList">
                            {subtopic.architectures.map((architecture) => {
                              const exposure = exposureFor(architecture.seen);

                              return (
                                <div
                                  className={`coverageArchitectureRow ${exposure}`}
                                  key={architecture.id}
                                >
                                  <span
                                    className={`coverageArchitectureStatus ${exposure}`}
                                  >
                                    {architecture.seen === 0
                                      ? '○'
                                      : architecture.seen}
                                  </span>

                                  <div>
                                    <strong>{architecture.name}</strong>
                                    <span>
                                      {architecture.seen === 0
                                        ? 'Not encountered yet'
                                        : architecture.seen === 1
                                        ? 'Encountered once'
                                        : `Encountered ${architecture.seen} times`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}