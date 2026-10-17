# Parcours : credit_rl.envs.credit_limit_env.CreditLimitEnv.step

Projet : Dynamic-Credit-Limit-Optimization-with-RL-
Snapshot : 8e409ee6ccd42af6faf8dbd68a89817e56918c90423afee18d5326f1a81685c5
Révision : locale
Moteur : 2.0

Parcours hypothétique, code non exécuté. 9 étapes parcourues, 39 opérations dans la fonction.

1. self — src/credit_rl/envs/credit_limit_env.py:170
2. action: int — src/credit_rl/envs/credit_limit_env.py:170
3. self._done — src/credit_rl/envs/credit_limit_env.py:171
4. **Décision hypothétique : False** — merge possible paths — src/credit_rl/envs/credit_limit_env.py:171
5. not self.action_space.contains(action) — src/credit_rl/envs/credit_limit_env.py:173
6. **Décision hypothétique : False** — merge possible paths — src/credit_rl/envs/credit_limit_env.py:173
7. action = int(action) — src/credit_rl/envs/credit_limit_env.py:175
8. previous = self.state — src/credit_rl/envs/credit_limit_env.py:176
9. decision_pd = self._predicted_pd — src/credit_rl/envs/credit_limit_env.py:177

## Limites


Les branches ne sont pas évaluées et les valeurs runtime restent indisponibles.

Filtres : {"edgeMode":"control","variable":"","orientation":"TB","follow":true,"hideSelf":true,"light":false,"nearby":false,"dimSecondary":true,"graphScope":{"focus":null,"direction":"both","depth":1,"relations":["CALLS","CONTAINS","IMPORTS","INHERITS","INSTANTIATES"]}}
