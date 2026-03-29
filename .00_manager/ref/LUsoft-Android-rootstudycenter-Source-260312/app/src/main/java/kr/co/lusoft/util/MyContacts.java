package kr.co.lusoft.util;

import org.json.JSONException;
import org.json.JSONObject;

public class MyContacts {
   public String name = "";
   public String phone = "";
   public String note = "";

   public void setPhone(String phone) {
      if (phone.startsWith(",")){
         phone = phone.substring(1);
      }
      this.phone = phone;
   }

   @Override
   public String toString() {
      JSONObject var1 = new JSONObject();

      try {
         if (name != null) {
            var1.put("name", name);
         }

         if (phone!= null) {
            var1.put("phone", phone);
         }

         if (note != null) {
            var1.put("note", note);
         }
      } catch (JSONException e) {
         e.printStackTrace();
      }
      return var1.toString();
//      return  "{\"name\"=\"" + name + '\"' +
//              ", \"phone\"=\"" + phone + '\"' +
//              ", \"note\"=\"" + note + '\"' +
//              '}';
   }
}
