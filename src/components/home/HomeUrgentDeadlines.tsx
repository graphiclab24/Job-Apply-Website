import React from 'react';
import { Link } from 'react-router-dom';
import { JobCircular } from '../../types';
import { AlertCircle, Clock } from 'lucide-react';
import { precacheJob, prefetchJobDetail } from '../../services/cache';

interface Props {
  tomorrowDeadlineJobs: JobCircular[];
  thisWeekDeadlineJobs: JobCircular[];
}

export const HomeUrgentDeadlines: React.FC<Props> = ({
  tomorrowDeadlineJobs,
  thisWeekDeadlineJobs,
}) => {
  return (
    <>
      {tomorrowDeadlineJobs.length > 0 && (
        <section className="max-w-6xl mx-auto px-4">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 animate-pulse">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-rose-900 block">
                  আগামীকাল আবেদনের শেষ দিন! (Tomorrow Deadline - {tomorrowDeadlineJobs.length}টি)
                </span>
                <p className="text-xs text-rose-700">
                  {tomorrowDeadlineJobs.map((j) => j.title).join(' • ')}
                </p>
              </div>
            </div>
            <Link
              to={`/jobs/${tomorrowDeadlineJobs[0].slug || tomorrowDeadlineJobs[0].id}`}
              state={{ preloadedJob: tomorrowDeadlineJobs[0] }}
              onMouseEnter={() => {
                precacheJob(tomorrowDeadlineJobs[0]);
                prefetchJobDetail(tomorrowDeadlineJobs[0].slug || tomorrowDeadlineJobs[0].id);
              }}
              onTouchStart={() => {
                precacheJob(tomorrowDeadlineJobs[0]);
                prefetchJobDetail(tomorrowDeadlineJobs[0].slug || tomorrowDeadlineJobs[0].id);
              }}
              className="shrink-0 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors"
            >
              দ্রুত আবেদন করুন
            </Link>
          </div>
        </section>
      )}

      {thisWeekDeadlineJobs.length > 0 && (
        <section className="max-w-6xl mx-auto px-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-semibold">
                চলতি সপ্তাহে শেষ হচ্ছে {thisWeekDeadlineJobs.length}টি সার্কুলার:
              </span>
              <span className="text-amber-800 line-clamp-1">
                {thisWeekDeadlineJobs.map((j) => j.title).join(', ')}
              </span>
            </div>
            <Link to="/jobs" className="font-bold underline text-amber-900 shrink-0 ml-2">
              সব দেখুন
            </Link>
          </div>
        </section>
      )}
    </>
  );
};
