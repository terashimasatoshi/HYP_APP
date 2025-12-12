import { CustomerData } from '../App';
import { Moon, Brain, Weight, Clock, Coffee, Wine, Activity } from 'lucide-react';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';

interface CounselingScreenProps {
  customerData: CustomerData;
  updateCustomerData: (data: Partial<CustomerData>) => void;
  onNext: () => void;
}

export function CounselingScreen({ customerData, updateCustomerData, onNext }: CounselingScreenProps) {
  const bedtimeOptions = [
    '21:00', '21:30', '22:00', '22:30', '23:00', '23:30', 
    '24:00', '0:30', '1:00', '1:30', '2:00'
  ];

  return (
    <div className="h-full p-8">
      <div className="max-w-6xl mx-auto h-full flex flex-col">
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <h2 className="text-green-800 mb-2">施術前カウンセリング</h2>
          <p className="text-sm text-gray-600">
            本日のコンディションについてお伺いします
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Three Cards for Subjective Conditions */}
          <div className="grid grid-cols-3 gap-6 mb-6">
            {/* Sleep Quality */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Moon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-gray-800">睡眠の質</h3>
                  <p className="text-xs text-gray-500">0: 悪い / 10: 良い</p>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="text-4xl text-blue-600 text-center mb-4">
                  {customerData.sleepQuality}
                </div>
                <Slider
                  value={[customerData.sleepQuality]}
                  onValueChange={([value]) => updateCustomerData({ sleepQuality: value })}
                  min={0}
                  max={10}
                  step={1}
                  className="mb-2"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>
            </div>

            {/* Stress */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Brain className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-gray-800">ストレス</h3>
                  <p className="text-xs text-gray-500">0: 低い / 10: 高い</p>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="text-4xl text-orange-600 text-center mb-4">
                  {customerData.stress}
                </div>
                <Slider
                  value={[customerData.stress]}
                  onValueChange={([value]) => updateCustomerData({ stress: value })}
                  min={0}
                  max={10}
                  step={1}
                  className="mb-2"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>
            </div>

            {/* Body Heaviness */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Weight className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-gray-800">頭皮・身体の重さ</h3>
                  <p className="text-xs text-gray-500">0: 軽い / 10: 重い</p>
                </div>
              </div>
              
              <div className="mb-4">
                <div className="text-4xl text-purple-600 text-center mb-4">
                  {customerData.bodyHeaviness}
                </div>
                <Slider
                  value={[customerData.bodyHeaviness]}
                  onValueChange={([value]) => updateCustomerData({ bodyHeaviness: value })}
                  min={0}
                  max={10}
                  step={1}
                  className="mb-2"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lifestyle Habits */}
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <h3 className="text-gray-800 mb-6">生活習慣（過去24時間）</h3>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Bedtime */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className="text-gray-700">就寝時間</span>
                </div>
                <select
                  value={customerData.bedtime}
                  onChange={(e) => updateCustomerData({ bedtime: e.target.value })}
                  className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-300"
                >
                  {bedtimeOptions.map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </div>

              {/* Alcohol */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <Wine className="w-5 h-5 text-red-600" />
                  </div>
                  <span className="text-gray-700">アルコール摂取</span>
                </div>
                <Switch
                  checked={customerData.alcohol}
                  onCheckedChange={(checked) => updateCustomerData({ alcohol: checked })}
                />
              </div>

              {/* Caffeine */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Coffee className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-gray-700">カフェイン摂取</span>
                </div>
                <Switch
                  checked={customerData.caffeine}
                  onCheckedChange={(checked) => updateCustomerData({ caffeine: checked })}
                />
              </div>

              {/* Exercise */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Activity className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-gray-700">運動</span>
                </div>
                <Switch
                  checked={customerData.exercise}
                  onCheckedChange={(checked) => updateCustomerData({ exercise: checked })}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onNext}
            className="px-12 py-4 bg-gradient-to-r from-green-400 to-emerald-500 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
          >
            施術へ進む
          </button>
        </div>
      </div>
    </div>
  );
}
