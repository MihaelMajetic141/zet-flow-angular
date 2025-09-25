import { NgModule, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { MapComponent } from './components/map-component/map-component';
import { LeafletModule } from '@bluehalo/ngx-leaflet';
import { HttpClientModule } from '@angular/common/http';
import { BusFront, LucideAngularModule, TramFront } from 'lucide-angular';



@NgModule({
  declarations: [
    App,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    MapComponent,
    LeafletModule,
    HttpClientModule,
    LucideAngularModule.pick({ BusFront, TramFront }),
],
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection()
  ],
  bootstrap: [App]
})
export class AppModule { }
