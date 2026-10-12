package com.smartbudget.app.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Telephony;
import android.telephony.SmsMessage;
import org.json.JSONArray;
import org.json.JSONObject;

public class SmsReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (messages != null && messages.length > 0) {
                StringBuilder bodyBuilder = new StringBuilder();
                String sender = "";
                long timestamp = System.currentTimeMillis();

                for (SmsMessage msg : messages) {
                    bodyBuilder.append(msg.getMessageBody());
                    sender = msg.getDisplayOriginatingAddress();
                    if (sender == null) sender = msg.getOriginatingAddress();
                    timestamp = msg.getTimestampMillis();
                }

                String body = bodyBuilder.toString();
                
                if (sender != null && sender.toUpperCase().contains("UZCARD") && body.contains("7318")) {
                    saveSmsToQueue(context, sender, body, timestamp);
                    
                    Intent localIntent = new Intent("com.smartbudget.app.SMS_RECEIVED");
                    localIntent.setPackage(context.getPackageName());
                    context.sendBroadcast(localIntent);
                }
            }
        }
    }

    private void saveSmsToQueue(Context context, String sender, String body, long timestamp) {
        SharedPreferences prefs = context.getSharedPreferences("sms_queue", Context.MODE_PRIVATE);
        String currentQueueStr = prefs.getString("queue", "[]");
        try {
            JSONArray queue = new JSONArray(currentQueueStr);
            JSONObject smsObj = new JSONObject();
            smsObj.put("sender", sender);
            smsObj.put("body", body);
            smsObj.put("timestamp", timestamp);
            queue.put(smsObj);
            
            prefs.edit().putString("queue", queue.toString()).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
