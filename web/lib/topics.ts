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

export type PracticeCategory = {
  within: string;
  any: string[];
};

export const PRACTICE_CATEGORIES: Record<string,PracticeCategory> = {
  // Proof
  'Proof by Deduction': {
    within: 'topic:Proof',
    any: ['family:deduction_divisibility','family:deduction_inequalities']
  },
  'Proof by Exhaustion': {
    within: 'topic:Proof',
    any: ['family:proof_by_exhaustion','technique:proof_by_exhaustion']
  },
  'Disproof by Counterexample': {
    within: 'topic:Proof',
    any: ['technique:counterexample']
  },
  'Proof by Contradiction': {
    within: 'topic:Proof',
    any: ['family:proof_by_contradiction','technique:proof_by_contradiction']
  },

  // Algebra & Functions
  'Algebraic Expressions': {
    within: 'topic:Algebra & Functions',
    any: ['family:polynomial_structure','family:rational_decomposition']
  },
  'Quadratics': {
    within: 'topic:Algebra & Functions',
    any: ['technique:quadratic_factorisation','technique:quadratic_graphs','technique:quadratic_tangency','technique:vertex_form']
  },
  'Equations & Inequalities': {
    within: 'topic:Algebra & Functions',
    any: ['family:inequality_reasoning','technique:equation_solving','technique:simultaneous_inequalities']
  },
  'Graphs & Transformations': {
    within: 'topic:Algebra & Functions',
    any: ['technique:graph_transformations','technique:quadratic_graphs','technique:modulus_graphs']
  },
  'Functions': {
    within: 'topic:Algebra & Functions',
    any: ['family:function_reasoning']
  },
  'Algebraic Methods': {
    within: 'topic:Algebra & Functions',
    any: ['family:polynomial_structure','family:rational_decomposition','technique:algebraic_substitution']
  },

  // Coordinate Geometry
  'Straight Line Graphs': {
    within: 'topic:Coordinate Geometry',
    any: ['family:straight_lines','family:linear_models']
  },
  'Circles': {
    within: 'topic:Coordinate Geometry',
    any: ['family:circles']
  },
  'Parametric Equations': {
    within: 'topic:Coordinate Geometry',
    any: ['family:parametric_equations']
  },

  // Sequences & Series
  'Sequences': {
    within: 'topic:Sequences & Series',
    any: ['family:recurrence_sequences']
  },
  'Arithmetic Sequences & Series': {
    within: 'topic:Sequences & Series',
    any: ['family:arithmetic_sequences','technique:arithmetic_sum']
  },
  'Geometric Sequences & Series': {
    within: 'topic:Sequences & Series',
    any: ['family:geometric_sequences','technique:geometric_sum','technique:sum_to_infinity']
  },
  'Binomial Expansion': {
    within: 'topic:Sequences & Series',
    any: ['family:binomial_expansion']
  },

  // Trigonometry
  'Trigonometric Ratios': {
    within: 'topic:Trigonometry',
    any: ['family:triangle_geometry','technique:sine_rule','technique:cosine_rule']
  },
  'Trigonometric Identities': {
    within: 'topic:Trigonometry',
    any: ['family:identity_reasoning','technique:identity_manipulation']
  },
  'Trigonometric Equations': {
    within: 'topic:Trigonometry',
    any: ['family:trig_equation_reasoning','technique:trigonometric_equations']
  },
  'Trigonometric Functions & Modelling': {
    within: 'topic:Trigonometry',
    any: ['family:graph_reasoning','family:periodic_modelling']
  },

  // Exponentials & Logarithms
  'Exponential Functions': {
    within: 'topic:Exponentials & Logarithms',
    any: ['family:exponential_equations']
  },
  'Logarithms': {
    within: 'topic:Exponentials & Logarithms',
    any: ['family:logarithm_laws']
  },
  'Exponential Models': {
    within: 'topic:Exponentials & Logarithms',
    any: ['family:exponential_models','family:log_linear_models']
  },

  // Differentiation
  'Basic Differentiation': {
    within: 'topic:Differentiation',
    any: ['family:rule_fluency','family:explicit_curves']
  },
  'Stationary Points': {
    within: 'topic:Differentiation',
    any: ['family:stationary_and_monotonic_reasoning','family:curve_analysis']
  },
  'Second Derivatives': {
    within: 'topic:Differentiation',
    any: ['family:higher_derivative_reasoning','architecture:inflection']
  },
  'Differentiating Trigonometric Functions': {
    within: 'topic:Differentiation',
    any: ['technique:trig_differentiation']
  },
  'Product & Quotient Rules': {
    within: 'topic:Differentiation',
    any: ['technique:product_rule','technique:quotient_rule']
  },
  'Chain Rule': {
    within: 'topic:Differentiation',
    any: ['technique:chain_rule']
  },
  'Implicit Differentiation': {
    within: 'topic:Differentiation',
    any: ['family:implicit_derivative_core','family:implicit_curve_extrema','technique:implicit_differentiation']
  },
  'Parametric Differentiation': {
    within: 'topic:Differentiation',
    any: ['family:parametric_derivative_core','family:parametric_line_geometry','technique:parametric_differentiation']
  },

  // Integration
  'Basic Integration': {
    within: 'topic:Integration',
    any: ['family:direct_antiderivative_construction','family:function_reconstruction_from_derivative']
  },
  'Definite Integration': {
    within: 'topic:Integration',
    any: ['family:definite_integral_evaluation','family:inverse_definite_integral_reasoning']
  },
  'Finding Areas Using Integration': {
    within: 'topic:Integration',
    any: ['family:geometric_area','family:area_from_explicit_boundaries','family:area_with_derived_tangent_boundaries']
  },
  'Integration by Parts': {
    within: 'topic:Integration',
    any: ['technique:integration_by_parts']
  },
  'Integration by Substitution': {
    within: 'topic:Integration',
    any: ['technique:substitution','architecture:substitution_transform']
  },
  'Solving Differential Equations': {
    within: 'topic:Integration',
    any: ['family:differential_models','technique:separation_of_variables']
  },
  'Trapezium Rule': {
    within: 'topic:Integration',
    any: ['family:numerical_integration','technique:trapezium_rule']
  },

  // Numerical Methods
  'Locating Roots': {
    within: 'topic:Numerical Methods',
    any: ['family:root_location']
  },
  'Newton-Raphson Method': {
    within: 'topic:Numerical Methods',
    any: ['family:newton_raphson','technique:newton_raphson']
  },

  // Vectors
  'Vectors': {
    within: 'topic:Vectors',
    any: ['family:vector_fundamentals']
  },
  'Vector Geometry': {
    within: 'topic:Vectors',
    any: ['family:vector_geometry','family:scalar_product_and_angles']
  },
  '3D Vectors': {
    within: 'topic:Vectors',
    any: ['family:three_dimensional_vectors']
  }
};
export function practiceCategory(label:string): PracticeCategory | null {
  return PRACTICE_CATEGORIES[label] || null;
}

