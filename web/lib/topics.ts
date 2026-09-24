export const TOPIC_AREAS = {
  pure: {
    label: 'Pure',
    description: 'Core pure mathematics topics.',
    topics: [
      ['proof','Proof'],['algebra-functions','Algebra & Functions'],['coordinate-geometry','Coordinate Geometry'],
      ['sequences-series','Sequences & Series'],['trigonometry','Trigonometry'],['exponentials-logarithms','Exponentials & Logarithms'],
      ['differentiation','Differentiation'],['integration','Integration'],['numerical-methods','Numerical Methods'],['vectors','Vectors']
    ]
  },
  statistics: {
    label: 'Statistics',
    description: 'Statistics and probability topics.',
    topics: [
      ['sampling','Sampling'],['data-presentation-interpretation','Data Presentation & Interpretation'],['probability','Probability'],
      ['statistical-distributions','Statistical Distributions'],['hypothesis-testing','Hypothesis Testing']
    ]
  },
  mechanics: {
    label: 'Mechanics',
    description: 'Applied mechanics topics.',
    topics: [
      ['quantities-units','Quantities & Units in Mechanics'],['kinematics','Kinematics'],['forces-newtons-laws',"Forces & Newton's Laws"],['moments','Moments']
    ]
  }
} as const;

export type AreaKey = keyof typeof TOPIC_AREAS;

export const SUBTOPICS: Record<string,string[]> = {
  proof: ['Proof by Deduction','Proof by Exhaustion','Disproof by Counterexample','Proof by Contradiction'],
  'algebra-functions': ['Algebraic Expressions','Quadratics','Equations & Inequalities','Graphs & Transformations','Functions','Algebraic Methods'],
  'coordinate-geometry': ['Straight Line Graphs','Circles','Parametric Equations'],
  'sequences-series': ['Sequences','Arithmetic Sequences & Series','Geometric Sequences & Series','Binomial Expansion'],
  trigonometry: ['Trigonometric Ratios','Trigonometric Identities','Trigonometric Equations','Radians','Trigonometric Functions & Modelling'],
  'exponentials-logarithms': ['Exponential Functions','Logarithms','Exponential Models'],
  differentiation: ['Basic Differentiation','Stationary Points','Second Derivatives','Differentiating Trigonometric Functions','Product & Quotient Rules','Chain Rule','Implicit Differentiation','Parametric Differentiation'],
  integration: ['Basic Integration','Definite Integration','Finding Areas Using Integration','Integration by Parts','Integration by Substitution','Parametric Integration','Solving Differential Equations','Trapezium Rule'],
  'numerical-methods': ['Locating Roots','Iteration','Newton-Raphson Method','Numerical Integration'],
  vectors: ['Vectors','Vector Geometry','3D Vectors'],
  sampling: ['Sampling'],
  'data-presentation-interpretation': ['Data Presentation & Interpretation'],
  probability: ['Probability','Conditional Probability'],
  'statistical-distributions': ['Binomial Distribution','Normal Distribution'],
  'hypothesis-testing': ['Hypothesis Testing'],
  'quantities-units': ['Quantities & Units in Mechanics'],
  kinematics: ['Constant Acceleration','Variable Acceleration','Projectiles'],
  'forces-newtons-laws': ["Forces & Newton's Laws",'Friction','Connected Particles'],
  moments: ['Moments']
};

export function topicInfo(area:string, slug:string){
  const group=TOPIC_AREAS[area as AreaKey];
  if(!group) return null;
  const hit=group.topics.find(([s])=>s===slug);
  return hit ? {area:area as AreaKey, areaLabel:group.label, slug, label:hit[1]} : null;
}


export type FocusGroup = { label: string; description?: string; skills: string[] };

export const FOCUS_GROUPS: Record<string, FocusGroup[]> = {
  integration: [
    {label:'Basic integration', skills:['Basic Integration']},
    {label:'Definite integration', skills:['Definite Integration']},
    {label:'Areas', skills:['Finding Areas Using Integration']},
    {label:'Integration techniques', description:'Parts, substitution and parametric integration', skills:['Integration by Parts','Integration by Substitution','Parametric Integration']},
    {label:'Differential equations', skills:['Solving Differential Equations']},
    {label:'Numerical integration', skills:['Trapezium Rule']},
  ],
  differentiation: [
    {label:'Differentiation techniques', description:'Product, quotient and chain rule', skills:['Basic Differentiation','Product & Quotient Rules','Chain Rule','Differentiating Trigonometric Functions']},
    {label:'Tangents & stationary points', skills:['Stationary Points','Second Derivatives','Tangents & Normals']},
    {label:'Implicit differentiation', skills:['Implicit Differentiation']},
    {label:'Parametric differentiation', skills:['Parametric Differentiation']},
    {label:'Rates of change', skills:['Rates of Change']},
  ],
};

export function focusGroups(slug:string): FocusGroup[] {
  if (FOCUS_GROUPS[slug]) return FOCUS_GROUPS[slug];
  return (SUBTOPICS[slug] || []).map(label => ({label, skills:[label]}));
}
