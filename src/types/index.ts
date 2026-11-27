export type Genre =
  | 'Fantasy'
  | 'Sci-Fi'
  | 'Mystery'
  | 'Romance'
  | 'Thriller'
  | 'Horror'
  | 'Historical'
  | 'Adventure';

export interface Chapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
}

export interface Novel {
  id: string;
  title: string;
  author: string;
  cover: string;
  coverUrl: string | null;
  coverColor: string;
  genres: Genre[];
  rating: number;
  ratingCount: number;
  synopsis: string;
  chapters: Chapter[];
  trending: boolean;
  newRelease: boolean;
  year: number;
  tags?: string[];
  isPublished?: boolean;
}

export interface EpubChapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
}

export interface EpubMetadata {
  title: string;
  author: string;
  description: string | null;
  coverDataUrl: string | null;
  chapters: EpubChapter[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  xp: number;
}

export interface Quiz {
  id: string;
  novelId: string | null;
  novelTitle: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  timeLimitSeconds: number;
  questions: QuizQuestion[];
  icon: string;
  color: string;
}

export interface QuizAnswerResult {
  position: number;
  selectedIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  xpEarned: number;
}

export interface QuizAttemptResult {
  attemptId: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  xpAwarded: number;
  isPerfect: boolean;
  isNewBest: boolean;
  answers: QuizAnswerResult[];
}

export interface QuizStats {
  totalAttempts: number;
  perfectScores: number;
  totalXpEarned: number;
  avgAccuracy: number;
  bestScore: number;
}

export interface QuizAttemptHistory {
  id: string;
  quizId: string;
  quizTitle: string;
  quizDifficulty: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  isPerfect: boolean;
  xpAwarded: number;
  createdAt: string;
}

export interface DailyChallenge {
  challengeId: string;
  challengeDate: string;
  quizId: string;
  quizTitle: string;
  quizDescription: string;
  quizDifficulty: 'Easy' | 'Medium' | 'Hard';
  quizTimeLimitSeconds: number;
  quizCoverColor: string;
  quizIcon: string;
  questionCount: number;
  hasAttempted: boolean;
  bestScore: number;
}

export type AchievementCategory = 'reading' | 'gaming' | 'xp' | 'social' | 'secret';

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythical';

export interface AchievementView {
  id: string;
  category: AchievementCategory;
  name: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  xpReward: number;
  threshold: number;
  isSecret: boolean;
  unlocked: boolean;
  unlockedAt: string | null;
  isShowcased: boolean;
  progress: number;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  avatar: string;
  xp: number;
  level: number;
  rank: number;
  quizzesWon: number;
  novelsRead: number;
  isCurrentUser?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar: string;
  bio: string;
  xp: number;
  level: number;
  streak: number;
  joinedDate: string;
  novelsRead: number;
  quizzesCompleted: number;
  quizzesWon: number;
  multiplayerWins: number;
}

export interface ReadingProgress {
  novelId: string;
  chapterIndex: number;
  progress: number;
  lastRead: string;
  lastReadAt: string;
  scrollRatio: number;
}

export interface ChapterBookmark {
  novelId: string;
  chapterIndex: number;
  createdAt: string;
}

export type PageId =
  | 'dashboard'
  | 'achievements'
  | 'discover'
  | 'library'
  | 'reader'
  | 'quizzes'
  | 'quiz-play'
  | 'multiplayer'
  | 'leaderboard'
  | 'profile'
  | 'submit'
  | 'admin'
  | 'auth'
  | 'scenarios'
  | 'scenario-play'
  | 'scenario-create'
  | 'my-scenarios'
  | 'admin-novels'
  | 'admin-novel-editor'
  | 'downloads';

export type UserRole = 'admin' | 'reader';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  avatarUrl: string | null;
  bio: string | null;
  xp: number;
  level: number;
  streak: number;
  createdAt: string;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface NovelSubmission {
  id: string;
  submitter_id: string;
  submitter_username?: string;
  novel_id: string | null;
  title: string;
  author: string;
  description: string | null;
  cover_url: string | null;
  cover_color: string;
  chapters: EpubChapter[];
  epub_storage_path: string | null;
  epub_file_name: string | null;
  status: SubmissionStatus;
  admin_feedback: string | null;
  rights_confirmed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioNodeChoice {
  id: string;
  text: string;
  nextNodeId: string;
}

export interface ScenarioNode {
  id: string;
  title: string;
  text: string;
  isEnding: boolean;
  endingLabel?: string;
  choices: ScenarioNodeChoice[];
}

export interface ScenarioCharacter {
  id: string;
  name: string;
  description: string;
  avatar: string;
}

export interface Scenario {
  id: string;
  novel_id: string;
  novel_title?: string;
  title: string;
  description: string | null;
  cover_color: string;
  creator_id: string;
  creator_username?: string;
  start_node_id: string;
  nodes: ScenarioNode[];
  characters: ScenarioCharacter[];
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  is_published: boolean;
  admin_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  xp_reward: number;
  endings_count: number;
  created_at: string;
  updated_at: string;
}

export interface ScenarioProgress {
  id: string;
  user_id: string;
  scenario_id: string;
  current_node_id: string;
  completed: boolean;
  endings_discovered: string[];
  xp_awarded: boolean;
  last_played_at: string;
  created_at: string;
  updated_at: string;
}

export interface ScenarioSubmission {
  id: string;
  scenario_id: string;
  submitter_id: string;
  submitter_username?: string;
  status: SubmissionStatus;
  admin_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchPlayer {
  id: string;
  username: string;
  avatar: string;
  xp: number;
  level: number;
  ready: boolean;
  score: number;
  isCurrentUser?: boolean;
  selectedAnswer?: number | null;
  answered?: boolean;
}
