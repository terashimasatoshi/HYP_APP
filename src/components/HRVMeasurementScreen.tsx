import { useState } from 'react';
import { CustomerData } from '../App';
import { ArrowRight } from 'lucide-react';

interface HRVMeasurementScreenProps {
  type: 'before' | 'after';
  customerData: CustomerData;
  updateCustomerData: (data: Partial<CustomerData>) => void;
  onNext: () => void;
}

export function HRVMeasurementScreen({ 
  type, 
  customerData, 
  updateCustomerData, 
  onNext 
}: HRVMeasurementScreenProps) {
  const [rmssd, setRmssd] = useState(type === 'before' ? customerData.beforeRMSSD : customerData.afterRMSSD);
  const [sdnn, setSdnn] = useState(type === 'before' ? customerData.beforeSDNN : customerData.afterSDNN);
  const [heartRate, setHeartRate] = useState(type === 'before' ? customerData.beforeHeartRate : customerData.afterHeartRate);

  const steps = [
    { id: 1, label: '施術前計測', active: type === 'before' },
    { id: 2, label: 'カウンセリング', active: false },
    { id: 3, label: '施術後計測', active: type === 'after' },
    { id: 4, label: 'レポート', active: false },
  ];

  const handleNext = () => {
    if (type === 'before') {
      updateCustomerData({
        beforeRMSSD: rmssd,
        beforeSDNN: sdnn,
        beforeHeartRate: heartRate,
      });
    } else {
      updateCustomerData({
        afterRMSSD: rmssd,
        afterSDNN: sdnn,
        afterHeartRate: heartRate,
      });
    }
    onNext();
  };

  const canProceed = rmssd > 0 || sdnn > 0 || heartRate > 0;

  return (
    <div className="h-full p-8">
      <div className="max-w-5xl mx-auto h-full flex flex-col">
        {/* Step Indicator */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    step.active 
                      ? 'bg-gradient-to-br from-green-400 to-emerald-500 text-white shadow-md' 
                      : 'bg-gray-100 text-gray-400'
                  }`}>
                    {step.id}
                  </div>
                  <span className={`text-sm ${step.active ? 'text-green-800' : 'text-gray-500'}`}>
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className="flex-1 h-0.5 bg-gray-200 mx-4" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Input Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8 flex-1 overflow-y-auto">
          {/* Title and Description */}
          <div className="mb-8">
            <h2 className="text-green-800 mb-3">
              {type === 'before' ? '施術前のHRV計測' : '施術後のHRV計測'}
            </h2>
            <p className="text-sm text-gray-600 mb-2">
              {type === 'before' 
                ? '別のHRV計測アプリやデバイスで測定し、表示された数値を下の項目に入力してください。'
                : '施術後に再度HRVを測定し、表示された数値を下の項目に入力してください。'}
            </p>
            <p className="text-xs text-gray-500">
              {type === 'before'
                ? '※ストレスの感じ方は、次のカウンセリング画面でお伺いします。'
                : '※施術前との変化は、レポート画面で自動的に可視化されます。'}
            </p>
          </div>

          {/* Input Forms */}
          <div className="space-y-4 max-w-3xl mx-auto">
            {/* RMSSD */}
            <div className="bg-gray-50 rounded-xl p-6 flex items-center justify-between">
              <div className="flex-1">
                <div className="text-gray-800 mb-1">RMSSD</div>
                <div className="text-xs text-gray-500">心拍変動の短期指標（ms）</div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={rmssd || ''}
                  onChange={(e) => setRmssd(Number(e.target.value))}
                  placeholder="例）35"
                  className="w-32 px-4 py-3 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-green-300"
                />
                <span className="text-gray-600 w-8">ms</span>
              </div>
            </div>

            {/* SDNN */}
            <div className="bg-gray-50 rounded-xl p-6 flex items-center justify-between">
              <div className="flex-1">
                <div className="text-gray-800 mb-1">SDNN</div>
                <div className="text-xs text-gray-500">心拍変動の全体的なばらつき（ms）</div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={sdnn || ''}
                  onChange={(e) => setSdnn(Number(e.target.value))}
                  placeholder="例）60"
                  className="w-32 px-4 py-3 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-green-300"
                />
                <span className="text-gray-600 w-8">ms</span>
              </div>
            </div>

            {/* Average Heart Rate */}
            <div className="bg-gray-50 rounded-xl p-6 flex items-center justify-between">
              <div className="flex-1">
                <div className="text-gray-800 mb-1">平均心拍数</div>
                <div className="text-xs text-gray-500">測定中の平均心拍数（bpm）</div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={heartRate || ''}
                  onChange={(e) => setHeartRate(Number(e.target.value))}
                  placeholder="例）72"
                  className="w-32 px-4 py-3 border border-gray-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-green-300"
                />
                <span className="text-gray-600 w-12">bpm</span>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="mt-8 max-w-3xl mx-auto">
            <button
              onClick={handleNext}
              disabled={!canProceed}
              className={`w-full py-4 rounded-xl transition-all flex items-center justify-center gap-2 ${
                canProceed
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md hover:shadow-lg'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              入力を完了して次へ
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
