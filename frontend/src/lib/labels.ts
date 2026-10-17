// Presentation labels only: identifiers in the analysis and in source code remain unchanged.
const labels: Record<string, string> = { Class: 'Classe', Function: 'Fonction', Method: 'Méthode', Parameter: 'Paramètre', Module: 'Module', Directory: 'Dossier', Attribute: 'Attribut', Variable: 'Variable', CallSite: 'Appel', ExternalDependency: 'Dépendance externe', Unknown: 'Inconnu', resolved: 'résolu', candidate: 'candidat', unresolved: 'non résolu', external: 'externe', read: 'lecture', write: 'écriture', declaration: 'déclaration', input: 'entrée', exit: 'fin', condition: 'condition', loop: 'boucle', assignment: 'affectation', return: 'retour', call: 'appel', join: 'jonction', expression: 'expression', True: 'Vrai', False: 'Faux', 'Body (symbolic)': 'Itération symbolique', Exit: 'Sortie', CONTAINS: 'contient', CALLS: 'appelle', IMPORTS: 'importe', INHERITS: 'hérite de', INSTANTIATES: 'instancie' };
export const label = (value: string) => labels[value] || value;
export function operationExplanation(kind: string) {
  const explanations: Record<string, string> = { input: 'Entrée de la fonction : les paramètres sont symboliques.', assignment: 'Nouvelle définition symbolique à partir de cette expression.', condition: 'Choisissez une branche hypothétique ; la condition n’est pas évaluée.', loop: 'Choisissez une itération symbolique ou la sortie de la boucle.', return: 'Expression retournée par ce chemin, sans calculer sa valeur.', join: 'Jonction de chemins possibles du graphe de contrôle.', exit: 'Fin de ce chemin dans la fonction.', call: 'Appel identifié statiquement ; ses cibles peuvent rester incertaines.' };
  return explanations[kind] || 'Opération analysée statiquement. Consultez sa source et les limites du flux.';
}

export function operationText(operation: { kind: string; expression: string }) {
  if (operation.kind === 'join') return 'Jonction des chemins possibles';
  if (operation.kind === 'exit') return 'Fin de la fonction';
  return operation.expression;
}
